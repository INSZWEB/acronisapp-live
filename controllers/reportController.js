const pdf = require("html-pdf"); // npm install html-pdf

const fs = require("fs");
const path = require("path");


// const generateCustomerReport = async (req, res) => {
//   try {
//     const { chartImage } = req.body;

//     if (!chartImage) {
//       return res.status(400).send("Chart image is required");
//     }

//     const html = `
//       <html>
//       <head>
//         <meta charset="utf-8"/>
//         <style>
//           body { font-family: Arial, sans-serif; font-size: 12px; }
//           .chart-container { text-align: center; margin-top: 30px; }
//           .chart-container img { width: 100%; max-width: 700px; }
//         </style>
//       </head>
//       <body>
//         <div class="chart-container">
//           <h3>Customer Usage Report</h3>
//           <img src="${chartImage}" />
//         </div>
//       </body>
//       </html>
//     `;

//     const browser = await puppeteer.launch({
//       args: ["--no-sandbox", "--disable-setuid-sandbox"],
//     });

//     const page = await browser.newPage();

//     // ✅ Use DOMContentLoaded and disable timeout
//     await page.setContent(html, {
//       waitUntil: "domcontentloaded",
//       timeout: 0,
//     });

//     const pdfBuffer = await page.pdf({
//       format: "A4",
//       printBackground: true,
//       margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
//     });

//     await browser.close();

//     res.set({
//       "Content-Type": "application/pdf",
//       "Content-Disposition": "inline; filename=customer-report.pdf",
//       "Content-Length": pdfBuffer.length,
//     });

//     res.send(pdfBuffer);

//   } catch (err) {
//     console.error("PDF error:", err);
//     res.status(500).send("Error generating PDF");
//   }
// };

// Helper function
const formatDateTime = (isoString) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d)) return isoString; // fallback if invalid
  const pad = (n) => n.toString().padStart(2, "0");
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};


const generateCustomerReport = async (req, res) => {
  try {
    const { chartImage } = req.body;
    const { customerId, month, startMonth, endMonth, year } = req.query;

    if (!customerId) return res.status(400).send("customerId is required");

    const now = new Date();
    const y = year ? Number(year) : now.getFullYear();
    let start, end;

    if (month) {
      start = new Date(y, month - 1, 1);
      end = new Date(y, month, 0, 23, 59, 59);
    } else if (startMonth && endMonth) {
      start = new Date(y, startMonth - 1, 1);
      end = new Date(y, endMonth, 0, 23, 59, 59);
    } else if (year) {
      start = new Date(y, 0, 1);
      end = new Date(y, 11, 31, 23, 59, 59);
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    const customer = await prisma.customer.findUnique({
      where: { id: Number(customerId) },
      select: {
        acronisCustomerTenantId: true,
        acronisCustomerTenantName: true,
      },
    });

    if (!customer?.acronisCustomerTenantId)
      return res.status(404).json({ message: "Customer not found" });

    const tenantId = customer.acronisCustomerTenantId;

    const devices = await prisma.device.findMany({
      where: { customerTenantId: tenantId },
      include: {
        policies: { where: { enabled: true }, select: { category: true, policyName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const totalDevices = devices.length;
    const onlineDevices = devices.filter(d => d.online).length;
    const offlineDevices = devices.filter(d => d.online === false).length;
    const disabledDevices = devices.filter(d => d.enabled === false).length;

    // -------------------
    // Device Rows
    // -------------------
    const deviceRows = devices.map(d => `
<tr>
  <td>${d.hostname ?? "-"}</td>
  <td>${d.osFamily ?? "-"}</td>
  <td class="${d.online ? "ok" : "warn"}">${d.online ? "Online" : "Offline"}</td>
  <td class="${d.enabled ? "ok" : "err"}">${d.enabled ? "Enabled" : "Disabled"}</td>
  <td>${d.registrationDate ? new Date(d.registrationDate).toLocaleString() : new Date(d.createdAt).toLocaleString()}</td>
</tr>`).join("");

    // -------------------
    // Policy Rows
    // -------------------
    const policyRows = devices.flatMap(d =>
      d.policies.map(p => `
<tr>
  <td>${d.hostname ?? "-"}</td>
  <td>${p.category ?? "-"}</td>
  <td>${p.policyName ?? "-"}</td>
</tr>`)).join("");

    // -------------------
    // Alerts
    // -------------------
    const alerts = await prisma.alertLog.findMany({
      where: {
        customerTenantId: tenantId,
        receivedAt: { gte: start.toISOString(), lte: end.toISOString() },
      },
      select: { alertId: true, rawJson: true },
      orderBy: { id: "desc" },
    });

    // Utility function
    function humanize(str) {
      if (!str) return "-";
      // Insert space before each uppercase letter except first, e.g. BackupFailed -> Backup Failed
      return str.replace(/([A-Z])/g, " $1").replace(/^ /, "");
    }


    const alertRows = alerts.map(a => `
<tr>
  <td>${a.rawJson?.receivedAt ? new Date(a.rawJson.receivedAt).toLocaleString() : "-"}</td>
  <td>${a.rawJson?.severity ?? "-"}</td>
<td>${humanize(a.rawJson?.type)}</td>
  <td>${a.rawJson?.category ?? "-"}</td>
  <td>${a.rawJson?.details?.resourceName ?? "-"}</td>
  <td>${a.rawJson?.details?.verdict ?? "-"}</td>
</tr>`).join("");

    let periodLabel = month
      ? `${new Date(y, month - 1).toLocaleString("default", { month: "long" })} ${y}`
      : startMonth && endMonth
        ? `${new Date(y, startMonth - 1).toLocaleString("default", { month: "long" })} – ${new Date(y, endMonth - 1).toLocaleString("default", { month: "long" })} ${y}`
        : year
          ? `Year ${y}`
          : new Date().toLocaleString("default", { month: "long", year: "numeric" });


    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
/* ---------------------------
   A4 Page Setup
--------------------------- */


html, body {
  font-family: Arial, sans-serif;
  font-size: 12px;
  color: #333;
}

/* Headings */
h2, h3 {
  text-align: center;
}

/* Sub headings and period */
.sub, .period {
  text-align: center;
  font-size: 11px;
  color: #666;
}

/* Logo */
img {
  display: block;
  margin: 6px auto;
  max-width: 720px;
}

/* Summary cards */
.summary {
  display: flex;
  justify-content: space-between;
  margin: 8px 0 12px;
}
.card {
  width: 23%;
  border: 1px solid #ddd;
  padding: 8px;
  text-align: center;
}

/* Tables */
table {
  width: 100%;
  border-collapse: collapse;
  page-break-inside: auto;
}
th, td {
  border: 1px solid #ccc;
  padding: 6px;
  font-size: 11px;
  line-height: 1.3;
}
th { background:#f4f6f8; }

.ok { color:green; font-weight:bold; }
.warn { color:orange; font-weight:bold; }
.err { color:red; font-weight:bold; }

tr { page-break-inside: avoid; }

.page-break {
  page-break-before: always;
}
</style>
</head>

<body>

<!-- Logo -->
<table width="100%" style="border:none; margin:0; padding:0;">
<tr>
<td style="border:none; text-align:center; padding:0;">
<img src="http://localhost:3000/assets/logo/Insightzlogo.png" style="width:200px;" />
</td>
</tr>
</table>

<h2>Customer Security Report</h2>
<div class="sub">${customer.acronisCustomerTenantName ?? ""}</div>
<div class="period">Report Period: ${periodLabel}</div>

${chartImage ? `<img src="${chartImage}" />` : ""}


<div class="page-break"></div>
<h3>Device List</h3>
<table>
<thead>
<tr><th>Hostname</th><th>OS</th><th>Status</th><th>Enabled</th><th>Registered</th></tr>
</thead>
<tbody>${deviceRows}</tbody>
</table>


<h3>Device Policies</h3>
<table>
<thead>
<tr><th>Hostname</th><th>Policy Category</th><th>Policy Name</th></tr>
</thead>
<tbody>${policyRows}</tbody>
</table>



<h3>Alert Details</h3>
<table>
<thead>
<tr><th>Received</th><th>Severity</th><th>Type</th><th>Category</th><th>Resource</th><th>Verdict</th></tr>
</thead>
<tbody>${alertRows}</tbody>
</table>

</body>
</html>


`;
    const options = {
      format: "A4",
      border: {
        top: "15mm",
        right: "15mm",
        bottom: "15mm",
        left: "15mm",
      },
      type: "pdf",
      orientation: "portrait",
    };
    // Generate PDF
    pdf.create(html, options).toStream((err, stream) => {
      if (err) return res.status(500).send("PDF generation failed");
      res.setHeader("Content-Type", "application/pdf");
      stream.pipe(res);
    });

  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).send("Error generating PDF");
  }
};




const getAlertReport = async (req, res) => {
  try {
    const {
      customerId,
      month,
      startMonth,
      endMonth,
      year,
      page = 1,
      limit = 100,
    } = req.query;

    if (!customerId) {
      return res.status(400).json({ message: "customerId is required" });
    }

    const skip = (page - 1) * limit;

    // ---------------------------------------
    // 1️⃣ Fetch customer → get acronisCustomerTenantId
    // ---------------------------------------
    const customer = await prisma.customer.findUnique({
      where: { id: Number(customerId) },
      select: { acronisCustomerTenantId: true },
    });

    if (!customer || !customer.acronisCustomerTenantId) {
      return res.status(404).json({
        message: "Customer or Acronis Tenant ID not found",
      });
    }

    const acronisTenantId = customer.acronisCustomerTenantId;

    // ---------------------------------------
    // 2️⃣ Date range calculation (rawJson.receivedAt)
    // ---------------------------------------
    let startDate, endDate;
    const now = new Date();

    if (month) {
      const y = year || now.getFullYear();
      startDate = new Date(y, month - 1, 1);
      endDate = new Date(y, month, 0, 23, 59, 59);
    }

    if (startMonth && endMonth) {
      const y = year || now.getFullYear();
      startDate = new Date(y, startMonth - 1, 1);
      endDate = new Date(y, endMonth, 0, 23, 59, 59);
    }

    if (year && !month && !startMonth) {
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31, 23, 59, 59);
    }

    // ---------------------------------------
    // 3️⃣ Prisma where condition
    // ---------------------------------------
    const whereCondition = {
      customerTenantId: acronisTenantId, // ✅ MATCH HERE
      ...(startDate &&
        endDate && {
        receivedAt: {
          gte: startDate.toISOString(),
          lte: endDate.toISOString(),
        },
      }),
    };

    // ---------------------------------------
    // 4️⃣ Fetch alert logs
    // ---------------------------------------
    const alerts = await prisma.alertLog.findMany({
      where: whereCondition,
      select: {
        id: true,
        alertId: true,
        partnerTenantId: true,
        customerName: true,
        customerTenantId: true,
        loggedAt: true,
        rawJson: true,
      },
      skip: Number(skip),
      take: Number(limit),
      orderBy: { id: "desc" },
    });

    // ---------------------------------------
    // 5️⃣ Normalize response
    // ---------------------------------------
    const formatted = alerts.map((item) => ({
      id: item.id,

      receivedAt:
        item.loggedAt ??
        item.rawJson?.receivedAt ??
        null,

      severity:
        item.severity ??
        item.rawJson?.severity ??
        null,

      type:
        item.type ??
        item.rawJson?.type ??
        null,

      category:
        item.category ??
        item.rawJson?.category ??
        null,

      // extracted ONLY from rawJson
      resourceName:
        item.rawJson?.details?.resourceName ??
        null,

      verdict:
        item.rawJson?.details?.verdict ??
        null,
    }));

    res.json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    console.error("Alert report error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch alert report",
    });
  }
};

const getDeviceReport = async (req, res) => {
  try {
    const {
      customerId,
      month,
      startMonth,
      endMonth,
      year,
    } = req.query;

    if (!customerId) {
      return res.status(400).json({ message: "customerId is required" });
    }

    // ---------------------------------------
    // 1️⃣ Fetch customer → acronisCustomerTenantId
    // ---------------------------------------
    const customer = await prisma.customer.findUnique({
      where: { id: Number(customerId) },
      select: { acronisCustomerTenantId: true },
    });

    if (!customer?.acronisCustomerTenantId) {
      return res.status(404).json({
        message: "Customer or Acronis Tenant ID not found",
      });
    }

    const acronisTenantId = customer.acronisCustomerTenantId;

    // ---------------------------------------
    // 2️⃣ Date range calculation
    // Using registrationDate if exists, else createdAt
    // ---------------------------------------
    let startDate, endDate;
    const now = new Date();

    if (month) {
      const y = year || now.getFullYear();
      startDate = new Date(y, month - 1, 1);
      endDate = new Date(y, month, 0, 23, 59, 59);
    }

    if (startMonth && endMonth) {
      const y = year || now.getFullYear();
      startDate = new Date(y, startMonth - 1, 1);
      endDate = new Date(y, endMonth, 0, 23, 59, 59);
    }

    if (year && !month && !startMonth) {
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31, 23, 59, 59);
    }

    // ---------------------------------------
    // 3️⃣ Base where condition
    // ---------------------------------------
    const baseWhere = {
      customerTenantId: acronisTenantId,
      ...(startDate &&
        endDate && {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      }),
    };

    // ---------------------------------------
    // 4️⃣ Aggregations (fast + clean)
    // ---------------------------------------
    const [
      total,
      online,
      offline,
      disabled,
    ] = await Promise.all([
      prisma.device.count({
        where: baseWhere,
      }),
      prisma.device.count({
        where: { ...baseWhere, online: true },
      }),
      prisma.device.count({
        where: { ...baseWhere, online: false },
      }),
      prisma.device.count({
        where: { ...baseWhere, enabled: false },
      }),
    ]);

    // ---------------------------------------
    // 5️⃣ Response
    // ---------------------------------------
    res.json({
      success: true,
      total,
      online,
      offline,
      disabled,
    });
  } catch (error) {
    console.error("Device report error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch device report",
    });
  }
};

module.exports = { generateCustomerReport, getAlertReport, getDeviceReport };
