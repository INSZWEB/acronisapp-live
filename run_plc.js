const axios = require("axios");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();


// -----------------------------
// Get Interval from Settings
// -----------------------------
async function getIntervalHours() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  // Default to 12 hours if null
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
// 3. FETCH DATA
// -------------------------------------------
async function fetchAgents(token, cred) {
  const url = `${cred.datacenterUrl}/api/agent_manager/v2/agents`;
  const data = await apiGet(url, token);
  return data.items || [];
}

async function fetchResources(token, cred) {
  const url = `${cred.datacenterUrl}/api/resource_management/v4/resources`;
  const data = await apiGet(url, token);
  return data.items || [];
}

async function fetchPolicies(token, cred) {
  const url = `${cred.datacenterUrl}/api/policy_management/v4/applications`;
  const data = await apiGet(url, token);
  return data.items || [];
}

async function fetchPolicyDetails(token, cred, policyId) {
  const url = `${cred.datacenterUrl}/api/policy_management/v4/policies/${policyId}`;
  return apiGet(url, token, {
    include_settings: true,
    full_composite: true,
  });
}

async function fetchPolicyApplications(token, cred) {
  const url = `${cred.datacenterUrl}/api/policy_management/v4/applications`;

  return apiGet(url, token, {
    policy_type: "policy.protection.total",
    deployment_states: "deployed",
  });
}

async function fetchPolicyMaster(token, cred, policyId) {
  const url = `${cred.datacenterUrl}/api/policy_management/v4/policies/${policyId}`;
  const data = await apiGet(url, token);

  return data.policy?.[0] || null;
}


// -------------------------------------------
// 4. HELPERS
// -------------------------------------------
function mapResourcesByAgentId(resources) {
  const map = {};
  for (const r of resources) {
    if (r.agent_id) map[r.agent_id] = r;
  }
  return map;
}

async function getDevice(agent, cred) {
  return prisma.device.findFirst({
    where: {
      agentId: agent.id,
      customerTenantId: cred.customerTenantId,
    },
  });
}

async function saveDevicePolicy(data) {
  return prisma.devicePolicy.upsert({
    where: {
      deviceId_policyId: {
        deviceId: data.deviceId,
        policyId: data.policyId,
      },
    },
    update: data,
    create: data,
  });
}


async function savePlan({
  customerTenantId,
  policyId,
  planName,
  planType,
  enabled,
}) {
  return prisma.plan.upsert({
    where: {
      customerTenantId_policyId: {
        customerTenantId,
        policyId,
      },
    },
    update: {
      planName,
      planType,
      enabled,
    },
    create: {
      customerTenantId,
      policyId,
      planName,
      planType,
      enabled,
    },
  });
}


// -------------------------------------------
// 5. MAIN
// -------------------------------------------

async function syncPlans(token, cred) {
  const policyCache = new Map();
console.log("token",token)
  const appData = await fetchPolicyApplications(token, cred);
  console.log("appData", appData)
  const flatApps = appData.items?.flat() || [];

  for (const app of flatApps) {
    const policyId = app.policy.id;

    let policyMaster = policyCache.get(policyId);

    if (!policyMaster) {
      policyMaster = await fetchPolicyMaster(token, cred, policyId);
      policyCache.set(policyId, policyMaster);
    }

    if (!policyMaster) continue;

    await savePlan({
      customerTenantId: cred.customerTenantId,
      policyId,
      planName: policyMaster.name,
      planType: policyMaster.type,
      enabled: app.enabled,
    });
  }

  console.log(
    `✔ Synced ${flatApps.length} plans for customer ${cred.customerTenantId}`
  );
}

async function processAllCredentials() {
  const policyCache = new Map();

  const PLAN_TYPES = [
    "policy.protection.total",
  ];

  const BACKUP_TYPES = [
    "policy.backup.machine",
  ];

  function resolvePolicyCategory(type) {
    if (PLAN_TYPES.includes(type)) return "PLAN";
    if (BACKUP_TYPES.includes(type)) return "BACKUP";
    return "POLICY";
  }

  try {
    const credentials = await getCredentials();
    if (!credentials.length) {
      console.log("❌ No active credentials found");
      return;
    }


    for (const cred of credentials) {
      console.log(`\n===== CUSTOMER ${cred.customerTenantId} =====`);

      const token = await getToken(cred);

      // ✅ 1. Sync Plans
      await syncPlans(token, cred);

      // ✅ 2. Sync Device Policies
      const agents = await fetchAgents(token, cred);
      const resources = await fetchResources(token, cred);
      const policies = await fetchPolicies(token, cred);

      const flatPolicies = policies.flat();
      const resourceByAgentId = mapResourcesByAgentId(resources);

      for (const agent of agents) {
        const resource = resourceByAgentId[agent.id];
        if (!resource) continue;

        const device = await getDevice(agent, cred);
        if (!device) continue;

        const agentPolicies = flatPolicies.filter(
          p =>
            p.agent_id === agent.id &&
            p.context?.id === resource.id
        );

        for (const pol of agentPolicies) {
          let policyDef = policyCache.get(pol.policy.id);

          if (!policyDef) {
            policyDef = await fetchPolicyDetails(
              token,
              cred,
              pol.policy.id
            );
            policyCache.set(pol.policy.id, policyDef);
          }

          const policyObj = policyDef.policy?.[0];
          const category = resolvePolicyCategory(pol.policy.type);



          await saveDevicePolicy({
            deviceId: device.id,
            agentId: agent.id,
            policyId: pol.policy.id,
            policyName: policyObj?.name || null,
            policyType: pol.policy.type,
            enabled: pol.enabled,
            category,
            customerTenantId: cred.customerTenantId,
            resourceId: resource.id,
          });
        }

        console.log(
          `✔ Saved ${agentPolicies.length} policies for ${device.hostname}`
        );
      }
    }

    console.log("\n=============== ALL DONE ===============");
  } catch (err) {
    console.error("ERROR:", err.response?.data || err.message);
  }
}



// -----------------------------
// Schedule Job Every N Hours
// -----------------------------
(async function scheduleJob() {
  const intervalHours = await getIntervalHours();
  const intervalMs = intervalHours * 60 * 60 * 1000; // convert hours → ms

  console.log(`Policy sync will run every ${intervalHours} hour(s).`);

  // Run immediately
  await processAllCredentials();

  // Schedule interval
  setInterval(async () => {
    console.log(`Running policy sync at ${new Date().toISOString()}`);
    await processAllCredentials();
  }, intervalMs);
})();