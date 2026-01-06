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
// 3. FETCH DATA
// -------------------------------------------
async function fetchPolicies(token, cred) {
  console.log("token",token)
  const url = `${cred.datacenterUrl}/api/policy_management/v4/policies`;
  const data = await apiGet(url, token);

  //console.log("data.items",JSON.stringify(data.items,null,2))
  return data.items || [];
}

async function fetchPolicyApplications(token, cred, policyId) {
  
  const url = `${cred.datacenterUrl}/api/policy_management/v4/applications`;
  const data = await apiGet(url, token, { policy_id: policyId });
  return data.items || [];
}

// -------------------------------------------
// 4. SAVE PLAN (ONE ROW PER AGENT)
// -------------------------------------------
async function saveProtectionPlan(cred, pol, agentId) {
  return prisma.plan.upsert({
    where: {
      customerTenantId_policyId_agentId: {
        customerTenantId: cred.customerTenantId,
        policyId: pol.id,
        agentId,
      },
    },
    update: {
      planName: pol.name,
      planType: pol.type,
      enabled: pol.enabled,
    },
    create: {
      customerTenantId: cred.customerTenantId,
      policyId: pol.id,
      planName: pol.name,
      planType: pol.type,
      enabled: pol.enabled,
      agentId,
    },
  });
}

// -------------------------------------------
// 5. MAIN PROCESS
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
      const policies = await fetchPolicies(token, cred);

      let planCount = 0;

      for (const container of policies) {
        for (const pol of container.policy || []) {
          if (pol.type !== "policy.protection.total") continue;

          planCount++;

          const appGroups = await fetchPolicyApplications(
            token,
            cred,
            pol.id
          );

          // ✅ collect ALL agentIds
          const agentIds = new Set();

          for (const group of appGroups) {
            for (const app of group) {
              if (app.agent_id) {
                agentIds.add(app.agent_id);
              }
            }
          }

          // save one row per agent
          for (const agentId of agentIds) {
            await saveProtectionPlan(cred, pol, agentId);
            console.log(`✅ Saved: ${pol.name} | Agent: ${agentId}`);
          }

          if (!agentIds.size) {
            console.log(`⚠️ ${pol.name} has no agents`);
          }
        }
      }

      console.log(`\n✅ Total Protection Plans Found: ${planCount}`);
    }

    console.log("\n=============== ALL DONE ===============");
  } catch (err) {
    console.error("ERROR:", err.response?.data || err.message);
  }
}

// -------------------------------------------
// 6. SCHEDULER
// -------------------------------------------
(async function scheduleJob() {
  const intervalHours = await getIntervalHours();
  const intervalMs = intervalHours * 60 * 60 * 1000;

  console.log(`Policy sync will run every ${intervalHours} hour(s).`);

  await processAllCredentials();

  setInterval(async () => {
    console.log(`Running policy sync at ${new Date().toISOString()}`);
    await processAllCredentials();
  }, intervalMs);
})();
