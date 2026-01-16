const axios = require("axios");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/* --------------------------------
   POLICY CACHE (PLAN + CHILD)
-------------------------------- */
const policyCache = new Map();

/* --------------------------------
   SETTINGS
-------------------------------- */
async function getIntervalHours() {
  try {
    const settings = await prisma.settings.findFirst({
      orderBy: { id: "desc" } // always latest row
    });

    return settings?.customerPolicyInterval ?? 2;
  } catch (err) {
    console.error(
      "Error loading customerPolicyInterval, defaulting to 2 hours:",
      err.message
    );
    return 2;
  }
}

/* --------------------------------
   CREDENTIALS
-------------------------------- */
async function getCredentials() {
  return prisma.credential.findMany({ where: { active: true } });
}

/* --------------------------------
   AUTH
-------------------------------- */
async function getToken(cred) {
  const res = await axios.post(
    `${cred.datacenterUrl}/api/2/idp/token`,
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

/* --------------------------------
   FETCH APIs
-------------------------------- */
async function fetchDevices(token, cred) {
  const data = await apiGet(
    `${cred.datacenterUrl}/api/resource_management/v4/resources`,
    token,
    { type: "resource.machine" }
  );
  return data.items || [];
}

async function fetchPlanApplications(token, cred) {
  const data = await apiGet(
    `${cred.datacenterUrl}/api/policy_management/v4/applications`,
    token,
    { policy_type: "policy.protection.total" }
  );
  return data.items.flat();
}

async function fetchPolicies(token, cred) {
  const data = await apiGet(
    `${cred.datacenterUrl}/api/policy_management/v4/policies`,
    token
  );
  return data.items.flatMap(i => i.policy || []);
}

async function fetchPolicyById(token, cred, policyId) {
  if (policyCache.has(policyId)) {
    return policyCache.get(policyId);
  }

  const data = await apiGet(
    `${cred.datacenterUrl}/api/policy_management/v4/policies/${policyId}`,
    token
  );

  policyCache.set(policyId, data);
  return data;
}

async function fetchAgentDetails(token, cred, agentId) {
  return apiGet(
    `${cred.datacenterUrl}/api/agent_manager/v2/agents/${agentId}`,
    token
  );
}

/* --------------------------------
   DB SAVE HELPERS
-------------------------------- */
async function saveDevice(device, agentDetails, cred) {
  await prisma.device.upsert({
    where: {
      customerTenantId_agentId: {
        customerTenantId: cred.customerTenantId,
        agentId: device.agent_id,
      },
    },
    update: {
      hostname: agentDetails.hostname || device.name,
      online: agentDetails.online,
      enabled: agentDetails.enabled,
      osFamily: agentDetails.platform?.family ?? null,
      registrationDate: agentDetails.registration_date
        ? new Date(agentDetails.registration_date)
        : null,
      units: agentDetails.units ?? null,
    },
    create: {
      customerTenantId: cred.customerTenantId,
      agentId: device.agent_id,
      hostname: agentDetails.hostname || device.name,
      online: agentDetails.online,
      enabled: agentDetails.enabled,
      osFamily: agentDetails.platform?.family ?? null,
      registrationDate: agentDetails.registration_date
        ? new Date(agentDetails.registration_date)
        : null,
      units: agentDetails.units ?? null,
    },
  });
}


async function savePlan({ cred, agentId, planId, planName, enabled }) {
  await prisma.plan.upsert({
    where: {
      customerTenantId_policyId_agentId: {
        customerTenantId: cred.customerTenantId,
        policyId: planId,
        agentId,
      },
    },
    update: {
      planName,
      enabled,
      planType: "policy.protection.total",
    },
    create: {
      customerTenantId: cred.customerTenantId,
      policyId: planId,
      planName,
      planType: "policy.protection.total",
      enabled,
      agentId,
    },
  });
}

async function savePolicy({
  cred,
  agentId,
  policyId,
  planType,
  planName,
  enabled,
}) {
  await prisma.policy.upsert({
    where: {
      customerTenantId_policyId_agentId: {
        customerTenantId: cred.customerTenantId,
        policyId,
        agentId
      },
    },
    update: {
      planType,
      planName,
      enabled,
      agentId,
    },
    create: {
      customerTenantId: cred.customerTenantId,
      policyId,
      planType,
      planName,
      enabled,
      agentId,
    },
  });
}

/* --------------------------------
   PROCESS + FILTER + STORE
-------------------------------- */
async function processDevices(devices, planApps, policies, token, cred) {
  for (const device of devices) {
    const agentId = device.agent_id;

    const agentPlans = planApps.filter(p => p.agent_id === agentId);
    if (!agentPlans.length) continue;

    for (const planApp of agentPlans) {
      const planId = planApp.policy.id;

      const childPolicies = policies.filter(
        p => Array.isArray(p.parent_ids) && p.parent_ids.includes(planId)
      );
      if (!childPolicies.length) continue;

      // ✅ FILTER: EDR OR ANTIMALWARE
      const hasRequiredPolicy = childPolicies.some(
        p =>
          (p.type === "policy.security.edr" && p.enabled === true) ||
          (p.type === "policy.security.antimalware_protection" &&
            p.enabled === true)
      );
      if (!hasRequiredPolicy) continue;

      // PLAN NAME
      const planDetails = await fetchPolicyById(token, cred, planId);
      const planName =
        planDetails?.policy?.[0]?.name ?? "Unknown Plan";

      // 🔹 FETCH AGENT DETAILS
      const agentDetails = await fetchAgentDetails(token, cred, agentId);

      // 🔹 SAVE DEVICE WITH AGENT DATA
      await saveDevice(device, agentDetails, cred);

      // SAVE PLAN
      await savePlan({
        cred,
        agentId,
        planId,
        planName,
        enabled: planDetails?.policy?.[0]?.enabled ?? true,
      });

      // SAVE CHILD POLICIES
      for (const p of childPolicies) {
        const childPolicyDetails = await fetchPolicyById(token, cred, p.id);
        const childPolicyName =
          childPolicyDetails?.policy?.[0]?.name ?? p.type;

        await savePolicy({
          cred,
          agentId,
          policyId: p.id,
          planType: p.type,
          planName: childPolicyName,
          enabled: p.enabled,
        });
      }
    }
  }
}

/* --------------------------------
   MAIN
-------------------------------- */
async function processAllCredentials() {
  const credentials = await getCredentials();

  for (const cred of credentials) {
    console.log(`\n===== CUSTOMER ${cred.customerTenantId} =====`);

    const token = await getToken(cred);
    const devices = await fetchDevices(token, cred);
    const planApps = await fetchPlanApplications(token, cred);
    const policies = await fetchPolicies(token, cred);

    // ✅ DELETE ONCE PER CUSTOMER
    console.log("DELETE tenantId:", cred.customerTenantId);

    await prisma.device.deleteMany({
      where: { customerTenantId: cred.customerTenantId }
    });
    await prisma.plan.deleteMany({
      where: { customerTenantId: cred.customerTenantId }
    });
    await prisma.policy.deleteMany({
      where: { customerTenantId: cred.customerTenantId }
    });

    await processDevices(devices, planApps, policies, token, cred);
  }
}


/* --------------------------------
   SCHEDULER
-------------------------------- */
/* --------------------------------
   BOOTSTRAP
-------------------------------- */
async function main() {
  const hours = await getIntervalHours();
  console.log(`Device-plan-policy sync every ${hours} hour(s)`);

  // 🔹 RUN FIRST TIME IMMEDIATELY
  await processAllCredentials();

  // 🔹 SCHEDULE NEXT RUNS
  setInterval(
    processAllCredentials,
    hours * 60 * 60 * 1000
  );
}

// ✅ START SCRIPT
main().catch(err => {
  console.error("Fatal error in PLC job:", err);
  process.exit(1);
});
