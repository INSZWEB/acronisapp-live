const { PrismaClient } = require("@prisma/client");
const axios = require("axios");

const prisma = new PrismaClient();

// -----------------------------
// Get Interval from Settings
// -----------------------------
async function getIntervalHours() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  return settings?.customerDeviceInterval ?? 12;
}

// -----------------------------
// OAuth2 Token
// -----------------------------
async function getAccessToken(clientId, clientSecret, dcUrl) {
  const tokenUrl = `${dcUrl}/bc/idp/token`;
  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const headers = {
    Authorization: `Basic ${encoded}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const body = new URLSearchParams({ grant_type: "client_credentials" });

  const resp = await axios.post(tokenUrl, body, { headers });
  return resp.data.access_token;
}

// -----------------------------
// Fetch Agents
// -----------------------------
async function fetchAgents(token, dcUrl) {
  const url = `${dcUrl}/api/agent_manager/v2/agents`;
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return resp.data.items || [];
}

// -----------------------------
// Normalize Agents
// -----------------------------
function normalizeAgent(agent) {
  const normalizedUnits = (agent.units || []).map((unit) => {
    const version = unit.version?.current || {};
    return {
      unit: unit.name,
      release_id: version.release_id,
      build: version.build,
    };
  });

  return {
    agent_id: agent.id,
    hostname: agent.hostname,
    host_id: agent.host_id,
    online: agent.online,
    enabled: agent.enabled,
    os_family: agent.platform?.family,
    registration_date: agent.registration_date,
    units: normalizedUnits,
  };
}

// -----------------------------
// Process Credentials & Sync Devices
// -----------------------------
async function processAllCredentials() {
  const credentials = await prisma.credential.findMany({
    select: {
      partnerTenantId: true,
      customerTenantId: true,
      clientId: true,
      clientSecret: true,
      datacenterUrl: true,
    },
  });

  for (const cred of credentials) {
    try {
      const token = await getAccessToken(
        cred.clientId,
        cred.clientSecret,
        cred.datacenterUrl
      );

      const agents = await fetchAgents(token, cred.datacenterUrl);

      // 👉 collect all agent IDs from Acronis
      const fetchedAgentIds = agents.map((a) => a.id);

      // -----------------------------
      // UPSERT DEVICES
      // -----------------------------
      for (const agent of agents) {
        const normalized = normalizeAgent(agent);

        await prisma.device.upsert({
          where: {
            customerTenantId_agentId: {
              customerTenantId: cred.customerTenantId,
              agentId: normalized.agent_id,
            },
          },
          update: {
            partnerTenantId: cred.partnerTenantId,
            hostname: normalized.hostname,
            hostId: normalized.host_id,
            online: normalized.online,
            enabled: normalized.enabled,
            osFamily: normalized.os_family,
            registrationDate: normalized.registration_date
              ? new Date(normalized.registration_date)
              : null,
            units: normalized.units,
          },
          create: {
            partnerTenantId: cred.partnerTenantId,
            customerTenantId: cred.customerTenantId,
            agentId: normalized.agent_id,
            hostname: normalized.hostname,
            hostId: normalized.host_id,
            online: normalized.online,
            enabled: normalized.enabled,
            osFamily: normalized.os_family,
            registrationDate: normalized.registration_date
              ? new Date(normalized.registration_date)
              : null,
            units: normalized.units,
          },
        });
      }

      // -----------------------------
      // DELETE STALE DEVICES
      // -----------------------------
      // Only delete if Acronis returned something (safety)
      if (fetchedAgentIds.length > 0) {
        await prisma.device.deleteMany({
          where: {
            customerTenantId: cred.customerTenantId,
            agentId: {
              notIn: fetchedAgentIds,
            },
          },
        });
      }

      console.log(
        `Synced ${agents.length} devices for customer ${cred.customerTenantId}`
      );
    } catch (error) {
      console.error(
        `Error processing customer ${cred.customerTenantId}:`,
        error.message
      );
    }
  }
}

// -----------------------------
// Schedule Job Every N Hours
// -----------------------------
(async function scheduleJob() {
  const intervalHours = await getIntervalHours();
  const intervalMs = intervalHours * 60 * 60 * 1000;

  console.log(`Device sync will run every ${intervalHours} hour(s).`);

  // Run immediately
  await processAllCredentials();

  // Schedule interval
  setInterval(async () => {
    console.log(`Running device sync at ${new Date().toISOString()}`);
    await processAllCredentials();
  }, intervalMs);
})();
