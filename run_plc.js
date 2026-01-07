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

async function fetchPolicies(token, cred) {
  //console.log("token",token)
  const url = `${cred.datacenterUrl}/api/policy_management/v4/policies`;
  const data = await apiGet(url, token);

  return data.items || [];
}

async function fetchPolicyApplications(token, cred, policyId) {
  const url = `${cred.datacenterUrl}/api/policy_management/v4/applications`;

  const data = await apiGet(url, token, {
    policy_id: policyId,
  });

  return data.items || [];
}


async function saveProtectionPlan(cred, pol, agentId = null) {
  return prisma.policy.upsert({
    where: {
      customerTenantId_policyId: {
        customerTenantId: cred.customerTenantId,
        policyId: pol.id,
      },
    },
    update: {
      planName: pol.name,
      planType: pol.type,
      enabled: pol.enabled,
      agentId, // 👈
    },
    create: {
      customerTenantId: cred.customerTenantId,
      policyId: pol.id,
      planName: pol.name,
      planType: pol.type,
      enabled: pol.enabled,
      agentId, // 👈
    },
  });
}



// async function saveProtectionPlan(cred, pol) {
//   return prisma.plan.upsert({
//     where: {
//       customerTenantId_policyId: {
//         customerTenantId: cred.customerTenantId,
//         policyId: pol.id,
//       },
//     },
//     update: {
//       planName: pol.name,
//       planType: pol.type,
//       enabled: pol.enabled,
//     },
//     create: {
//       customerTenantId: cred.customerTenantId,
//       policyId: pol.id,
//       planName: pol.name,
//       planType: pol.type,
//       enabled: pol.enabled,
//     },
//   });
// }

// -------------------------------------------
// 5. MAIN
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


      console.log("\n🛡 FILTERED: PROTECTION PLANS ONLY");
      console.log("=================================\n");
      let planCount = 0;
      for (const container of policies) {
        for (const pol of container.policy || []) {
          if (pol.type !== "policy.protection.total") {
            planCount++;
            // 🔽 fetch applications for this policy
            const appGroups = await fetchPolicyApplications(token, cred, pol.id);

            // get first agentId (if exists)
            let agentId = null;

            for (const group of appGroups) {
              for (const app of group) {
                if (app.agent_id) {
                  agentId = app.agent_id;
                  break;
                }
              }
              if (agentId) break;
            }

            await saveProtectionPlan(cred, pol, agentId);

            console.log(`✅ Saved: ${pol.name} | Agent: ${agentId ?? "N/A"}`);


          }
        }
      }

      console.log(`\n✅ Total Protection Plans Found: ${planCount}`);
      console.log("\n========== DONE ==========\n");
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
 // await processAllCredentials();

  // Schedule interval
  setInterval(async () => {
    console.log(`Running policy sync at ${new Date().toISOString()}`);
    await processAllCredentials();
  }, intervalMs);
})();