const axios = require("axios");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

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
  const TOKEN_URL = `${cred.datacenterUrl}/api/2/idp/token`;

  const res = await axios.post(
    TOKEN_URL,
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

async function fetchAgents(token, cred) {
  const url = `${cred.datacenterUrl}/api/agent_manager/v2/agents`;
  const data = await apiGet(url, token);
  return data.items || [];
}

async function fetchResources(token, cred) {
  const url = `${cred.datacenterUrl}/api/resource_management/v4/resources`;
  const data = await apiGet(url, token, { limit: 500 });
  return data.items || [];
}

async function fetchPolicies(token, cred, resourceId) {
  const url = `${cred.datacenterUrl}/api/policy_management/v4/policies`;
  const params = { applicable_to_context_id: resourceId };
  const data = await apiGet(url, token, params);
  return data.items || [];
}

// -------------------------------------------
// 3. MATCH AGENTS → RESOURCES
// -------------------------------------------
function mapAgentsToResources(agents, resources) {
  const mapping = {};

  for (const a of agents) {
    const ahost = (a.hostname || "").toLowerCase();

    for (const r of resources) {
      const rhost = (r.hostname || r.name || "").toLowerCase();

      if (ahost === rhost) {
        mapping[a.id] = r;
        break;
      }
    }
  }

  return mapping;
}

// -------------------------------------------
// 4. SAVE TO POLICY TABLE
// -------------------------------------------
async function savePolicyRecord(policy, cred, agentId, resourceId) {
  return prisma.policy.create({
    data: {
      policyId: policy.id,
      createdAtAcronis: policy.created_at,
      updatedAtAcronis: policy.updated_at,
      type: policy.type,
      name: policy.name,
      origin: policy.origin,
      enabled: policy.enabled,

      partnerTenantId: cred.partnerTenantId,
      customerTenantId: cred.customerTenantId,

      agentId,
      resourceId,
    },
  });
}

// -------------------------------------------
// 5. MAIN EXECUTION
// -------------------------------------------
async function main() {
  try {
    const credentials = await getCredentials();

    if (credentials.length === 0) {
      console.log("❌ No active credentials found.");
      return;
    }

    for (const cred of credentials) {
      console.log(
        `\n==================== CUSTOMER ${cred.customerTenantId} ====================`
      );

      const token = await getToken(cred);

      const agents = await fetchAgents(token, cred);
      const resources = await fetchResources(token, cred);

      const mapping = mapAgentsToResources(agents, resources);

      for (const ag of agents) {
        const agentId = ag.id;
        const resource = mapping[agentId];

        if (!resource) continue;

        const resourceId = resource.id;
        const policies = await fetchPolicies(token, cred, resourceId);

        // Loop through policy containers
        for (const container of policies) {
          const policyList = container.policy || [];

          for (const pol of policyList) {
            await savePolicyRecord(pol, cred, agentId, resourceId);
            console.log(`✔ Saved policy ${pol.id} for agent ${agentId}`);
          }
        }
      }

      console.log("\n✔✔✔ Completed for customer:", cred.customerTenantId, "\n");
    }

    console.log("=============== ALL DONE ===============");

  } catch (err) {
    console.error("ERROR:", err.response?.data || err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
