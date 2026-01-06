const axios = require("axios");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// -----------------------------
// Get Interval from Settings
// -----------------------------
async function getIntervalHours() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  return settings?.customerPolicyInterval ?? 2;
}

// -------------------------------------------
// 1. LOAD ACTIVE CREDENTIALS
// -------------------------------------------
async function getCredentials() {
  return prisma.credential.findMany({
    where: { active: true },
  });
}

// -------------------------------------------
// 2. ACRONIS API HELPERS
// -------------------------------------------
async function getToken(cred) {
  const url = `${cred.datacenterUrl}/api/2/idp/token`;

  const res = await axios.post(
    url,
    new URLSearchParams({ grant_type: "client_credentials" }),
    {
      auth: {
        username: cred.clientId,
        password: cred.clientSecret,
      },
    }
  );

  return res.data.access_token;
}

async function apiGet(url, token, params = {}) {
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });
  return res.data;
}

// -------------------------------------------
// 3. FETCH RESOURCES (MACHINES)
// -------------------------------------------
async function fetchResources(token, cred) {
  const url = `${cred.datacenterUrl}/api/resource_management/v4/resources`;

  const data = await apiGet(url, token, {
    type: "resource.machine",
    include_attributes: true,
  });

  return data.items || [];
}

// -------------------------------------------
// 4. ATTRIBUTE NORMALIZER
// -------------------------------------------
function normalizeAttributes(attrs = []) {
  const obj = {};
  for (const a of attrs) {
    if (a?.key) obj[a.key] = a.value ?? null;
  }
  return obj;
}

// -------------------------------------------
// 5. SAVE RESOURCES (UPSERT)
// -------------------------------------------
async function saveResources(resources, cred) {
  for (const r of resources) {
    if (!r.agent_id) continue;

    await prisma.resource.upsert({
      where: { agentId: r.agent_id },
      update: {
        acronisResourceId: r.id,
        name: r.name,
        userDefinedName: r.user_defined_name,
        type: r.type,
        attributes:r.attributes,
        updatedAt: new Date(r.updated_at),
        lastSyncedAt: new Date(),
      },
      create: {
        customerTenantId: cred.customerTenantId,
        acronisTenantId: r.tenant_id,
        acronisResourceId: r.id,
        agentId: r.agent_id,
        name: r.name,
        userDefinedName: r.user_defined_name,
        type: r.type,
        attributes:r.attributes,
        createdAt: new Date(r.created_at),
        updatedAt: new Date(r.updated_at),
      },
    });
  }
}

// -------------------------------------------
// 6. PROCESS ALL CUSTOMERS
// -------------------------------------------
async function processAllCredentials() {
  try {
    const credentials = await getCredentials();
    if (!credentials.length) {
      console.log("❌ No active credentials found");
      return;
    }

    for (const cred of credentials) {
      console.log(`\n===== CUSTOMER ${cred.customerTenantId} =====`);

      const token = await getToken(cred);

      const resources = await fetchResources(token, cred);
      console.log(`Found ${resources.length} machines`);

      await saveResources(resources, cred);
    }

    console.log("\n=============== ALL DONE ===============");
  } catch (err) {
    console.error("ERROR:", err.response?.data || err.message);
  }
}

// -----------------------------
// 7. SCHEDULER
// -----------------------------
(async function scheduleJob() {
  const intervalHours = await getIntervalHours();
  const intervalMs = intervalHours * 60 * 60 * 1000;

  console.log(`Policy sync will run every ${intervalHours} hour(s).`);

  await processAllCredentials();

  setInterval(async () => {
    console.log(`Running resource sync at ${new Date().toISOString()}`);
    await processAllCredentials();
  }, intervalMs);
})();
