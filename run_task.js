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

async function fetchAgents(headers, dcUrl) {
  const AGENT_URL = `${dcUrl}/api/agent_manager/v2/agents`;
  const res = await axios.get(AGENT_URL, { headers });

  //console.log("res.data?.items", res.data?.items)
  return res.data?.items || [];
}

async function fetchResources(headers, dcUrl) {
  const RESOURCE_URL = `${dcUrl}/api/resource_management/v4/resources`;
  const res = await axios.get(RESOURCE_URL, { headers, params: { type: "machine" } });
  return res.data?.items || [];
}

async function fetchCompletedTasks(headers, dcUrl, resourceId, startDate, endDate) {

  console.log("resourceId", resourceId)
  const TASK_URL = `${dcUrl}/api/task_manager/v2/tasks`;

  const params = {
    resourceId,
    completedAt: `gt(${startDate})`,
    order: "asc(completedAt)",
  };

  const res = await axios.get(TASK_URL, { headers, params });
  const tasks = res.data?.items || [];

  return tasks.filter(t => t.completedAt <= endDate && t.state === "completed");
}

// -------------------------------------------
// 3. NORMALIZATION LOGIC
// -------------------------------------------
function buildMonthlyReport(deviceName, agentId, resourceId, tasks, monthLabel) {
  let totalScans = 0;
  const scanTypes = { WinScan: 0, TpScan: 0, NGMP_FullScan: 0 };
  let totalVulns = 0;
  let maxVulns = 0;
  let totalPatches = 0;
  let infectedFiles = 0;
  let manualScans = 0;
  let scheduledScans = 0;

  for (const t of tasks) {
    const taskType = t.type || "";
    const payload = t.result?.payload || {};

    if (["WinScan", "TpScan", "NGMP_FullScan"].includes(taskType)) {
      totalScans++;
      scanTypes[taskType]++;

      const vulns = payload.vCountTotal || 0;
      const patches = payload.pCountTotal || 0;
      const infected = payload.Infected || 0;

      totalVulns += vulns;
      totalPatches += patches;
      infectedFiles += infected;
      maxVulns = Math.max(maxVulns, vulns);

      const runMode = t.context?.runMode || "";
      if (runMode === "Manual") manualScans++;
      else scheduledScans++;
    }
  }

  const avgVulns = totalScans ? (totalVulns / totalScans).toFixed(2) : 0;
  const risk = totalVulns > 1000 || infectedFiles > 0 ? "HIGH" : "LOW";

  return {
    "Report Month": monthLabel,
    "Device Name": deviceName,
    "Agent ID": agentId,
    "Resource ID": resourceId,
    "Total Scans Executed": totalScans,
    "Vulnerability Scans (WinScan)": scanTypes.WinScan,
    "Patch Scans (TpScan)": scanTypes.TpScan,
    "Malware Scans (NGMP)": scanTypes.NGMP_FullScan,
    "Total Vulnerabilities Detected": totalVulns,
    "Average Vulnerabilities per Scan": avgVulns,
    "Maximum Vulnerabilities in Single Scan": maxVulns,
    "Total Missing Patches Identified": totalPatches,
    "Infected Files Detected": infectedFiles,
    "Manual Scans Executed": manualScans,
    "Scheduled Scans Executed": scheduledScans,
    "Scan Success Rate (%)": 100,
    "Overall Device Risk Level": risk,
  };
}

// -------------------------------------------
// 4. MAIN
// -------------------------------------------
async function main() {
  try {
    // Static start/end dates
    const startDate = "2025-12-01T00:00:00Z";
    const endDate = "2026-01-21T00:00:00Z";
    const monthLabel = startDate.slice(0, 7);

    const credentials = await getCredentials();

    if (!credentials.length) {
      console.log("❌ No active credentials found.");
      return;
    }

    console.log("\n========== POLICY STATUS PER DEVICE ==========");

    for (const cred of credentials) {
      try {
        const token = await getToken(cred);
        const headers = { Authorization: `Bearer ${token}` };

        const agents = await fetchAgents(headers, cred.datacenterUrl);
        const resources = await fetchResources(headers, cred.datacenterUrl);

        //console.log("resources",resources);

        if (!agents.length) {
          console.log(`❌ No agents found for datacenter ${cred.datacenterUrl}`);
          continue;
        }
        if (!resources.length) {
          console.log(`❌ No resources found for datacenter ${cred.datacenterUrl}`);
        }

        const resourceMap = {};

        (resources || []).forEach(r => {
          if (r?.id && r?.agent_id && r?.name) {
            resourceMap[r.agent_id.toLowerCase()] = {
              id: r.id,
              agent_id: r.agent_id,
              name: r.name,
            };
          }
        });

        //console.log("resourceMap", resourceMap);


        for (const agent of agents) {
          const agentId = agent.id;
          const hostname = agent.hostname;

          const matchedResourceEntry = Object.entries(resourceMap).find(
            ([_, resource]) => resource.agent_id === agentId
          );

          if (!matchedResourceEntry) {
            console.log(`⚠️ No matching resource found for agent ${hostname}`);
            continue;
          }

          const [_, { id: resourceId, name }] = matchedResourceEntry;

          const tasks = await fetchCompletedTasks(
            headers,
            cred.datacenterUrl,
            resourceId,
            startDate,
            endDate
          );

          if (!tasks.length) {
            console.log(`⚠️ No completed tasks found for device ${hostname}`);
            continue;
          }

          const report = buildMonthlyReport(
            hostname,
            agentId,
            resourceId,
            tasks,
            monthLabel
          );

          console.log("\n================ MONTHLY REPORT ================");
          for (const [k, v] of Object.entries(report)) {
            console.log(`${k} : ${v}`);
          }
        }


      } catch (err) {
        console.error(`❌ Error processing datacenter ${cred.datacenterUrl}:`, err.message || err);
      }
    }
  } catch (err) {
    console.error("❌ Error:", err.message || err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
