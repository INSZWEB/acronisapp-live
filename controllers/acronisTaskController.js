const {
  getCredentials,
  getToken,
  fetchAgents,
  fetchResources,
  fetchCompletedTasks,
} = require("../services/acronisTaskService");

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/* ==============================
   REPORT BUILDER
================================ */
function buildMonthlyReport(device, agentId, resourceId, tasks, month) {
  const scanTypes = {
    WinScan: 0,
    TpScan: 0,
    NGMP_FullScan: 0,
  };

  let totalScans = 0;
  let totalVulns = 0;
  let maxVulns = 0;
  let infectedFiles = 0;
  let manual = 0;
  let scheduled = 0;
  let patchScanRuns = 0;
  const uniquePatches = new Set();

  for (const t of tasks) {
    const type = t.type || "";
    const payload = t.result?.payload || {};
    const context = t.context || {};

    if (["WinScan", "TpScan", "NGMP_FullScan"].includes(type)) {
      totalScans++;
      scanTypes[type]++;

      const vulns = payload.vCountTotal || 0;
      const infected = payload.Infected || 0;

      totalVulns += vulns;
      maxVulns = Math.max(maxVulns, vulns);
      infectedFiles += infected;

      context.runMode === "Manual" ? manual++ : scheduled++;
    }

    if (type === "TpScan") {
      patchScanRuns++;
      (payload.patches || []).forEach((p) => uniquePatches.add(p));
    }
  }

  const avgVulns = totalScans ? +(totalVulns / totalScans).toFixed(2) : 0;

  let historicalRisk = "LOW";
  if (infectedFiles > 0 || totalVulns > 1000) historicalRisk = "HIGH";
  else if (totalVulns > 300) historicalRisk = "MEDIUM";

  return {
    reportMonth: month,
    device,
    agentId,
    resourceId,
    totalScans,
    scanTypes,
    totalVulns,
    avgVulns,
    maxVulns,
    patchScanRuns,
    uniqueMissingPatches: [...uniquePatches],
    infectedFiles,
    manual,
    scheduled,
    historicalRisk,
    currentRisk: "LOW",
  };
}


function toRFC3339Range(start, end) {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T23:59:59.999Z`);

  if (isNaN(startDate) || isNaN(endDate)) {
    throw new Error("Invalid date format");
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

/* ==============================
   API
================================ */
exports.task = async (req, res) => {
  const { customerId, start, end } = req.query;

  try {
    /* ---------- Validate Dates ---------- */
    let startDate, endDate;

    try {
      ({ startDate, endDate } = toRFC3339Range(start, end));
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD",
      });
    }

    const month = startDate.slice(0, 7);

    /* ---------- Customer ---------- */
    const customer = await prisma.customer.findUnique({
      where: { id: Number(customerId) },
      select: { acronisCustomerTenantId: true },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    /* ---------- Credentials ---------- */
    const credentials = await prisma.credential.findMany({
      where: {
        customerTenantId: customer.acronisCustomerTenantId,
        active: true,
      },
    });

    if (!credentials.length) {
      return res.status(404).json({
        success: false,
        message: "No active credentials found",
      });
    }

    /* ---------- Build Reports ---------- */
    const reports = [];

    for (const cred of credentials) {
      const token = await getToken(cred);
      const headers = { Authorization: `Bearer ${token}` };

      const agents = await fetchAgents(headers, cred.datacenterUrl);
      const resources = await fetchResources(headers, cred.datacenterUrl);

      const resourceMap = Object.fromEntries(
        resources.map((r) => [r.name, r.id])
      );

      for (const agent of agents) {
        const resourceId = resourceMap[agent.hostname];
        if (!resourceId) continue;

        const tasks = await fetchCompletedTasks(
          headers,
          resourceId,
          cred.datacenterUrl,
          startDate,
          endDate
        );

        if (!tasks.length) continue;

        reports.push(
          buildMonthlyReport(
            agent.hostname,
            agent.id,
            resourceId,
            tasks,
            month
          )
        );
      }
    }

    return res.status(200).json({
      success: true,
      data: reports,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
