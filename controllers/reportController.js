const pdf = require("html-pdf-node");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { PDFDocument, rgb } = require("pdf-lib");

// Ensure the uploads folder exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const { createTransporter } = require('../config/mailConfig')
const { PrismaClient } = require("@prisma/client");
const { ERROR_MESSAGES, STATUS_CODES, EMAIL_AUTH, BASE_URL_FRONTEND } = require('../constants/constants');
const { type } = require("os");

const prisma = new PrismaClient();
const transporter = createTransporter();
const sendMail = async ({ to, cc, attachment }) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,                     // primary recipient
    cc,                     // optional CC
    subject: "EMAIL_AUTH.SUBJECT",
    html: `<p>Please find the invoice attached.</p>`,
    attachments: [
      {
        filename: "invoice.pdf",
        content: attachment, // PDF buffer
        contentType: "application/pdf",
      },
    ],
  };

  await transporter.sendMail(mailOptions);
};

const UPLOAD_BASE = path.join(process.cwd(), "uploads", "reports");


const loadBase64 = (p) =>
  `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}`;

/* ===============================
   LOAD IMAGES
================================ */
const firstPageImg = loadBase64("uploads/logo/firstpage.png");
const headerImg = loadBase64("uploads/logo/header.png");
const footerImg = loadBase64("uploads/logo/footer.png");
const endPageImg = loadBase64("uploads/logo/endpage.png");

const generateCustomerReport = async (req, res) => {
  try {
    const { chartImage,deviceImage } = req.body;
    const { customerId, range,downloadMode = "manual", to,  cc = [],reportType, } = req.body;

    if (!customerId) return res.status(400).send("customerId is required");

    let start, end;

    // AUTO MODE → calculate date by reportType
    if (downloadMode === "auto") {
      end = new Date(); // current date
      start = new Date(end); // clone

      switch (reportType) {
        case "1month":
          start.setMonth(end.getMonth() - 1);
          break;

        case "3month":
          start.setMonth(end.getMonth() - 3);
          break;

        case "1year":
          start.setFullYear(end.getFullYear() - 1);
          break;

        default:
          return res.status(400).json({
            error: "Invalid reportType. Use 1month, 3month, or 1year",
          });
      }
    }
    // MANUAL / FORWARD MODE → use range
    else {
      if (!range?.startDate || !range?.endDate) {
        return res.status(400).json({
          error: "range.startDate and range.endDate are required",
        });
      }

      start = new Date(range.startDate);
      end = new Date(range.endDate);
    }

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        error: "Invalid date range",
      });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: Number(customerId) },
      select: {
        acronisCustomerTenantId: true,
        acronisCustomerTenantName: true,
        partnerTenantId: true
      },
    });

    if (!customer?.acronisCustomerTenantId)
      return res.status(404).json({ message: "Customer not found" });

    const tenantId = customer.acronisCustomerTenantId;

    const devices = await prisma.device.findMany({
      where: { customerTenantId: tenantId },
      orderBy: { createdAt: "desc" },
    });

    const policies = await prisma.policy.findMany({
      where: {
        customerTenantId: tenantId, enabled: true, agentId: {
          not: null,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    console.log("policies", policies)

    const plan = await prisma.plan.findMany({
      where: {
        customerTenantId: tenantId, agentId: {
          not: null,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    console.log("plan", plan)


    /* ---------------- CONTACT ---------------- */
    const contact = await prisma.parnterContact.findFirst({
      where: {
        tenantId: customer.partnerTenantId,
        types: "company_billing",
      },
      select: {
        email: true,
        address1: true,
        address2: true,
        city: true,
        zipcode: true,
        state: true,
        country: true,
      },
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
    const policyRows = policies.map(p => `
<tr>

  <td>${p.planName ?? "-"}</td>
    <td>${p.enabled ?? "-"}</td>
</tr>`).join("");

    const uniquePlans = [
      ...new Set(plan.map(p => p.planName ?? p.planType))
    ];
    const planRows = uniquePlans.map(p => `
<tr>
  <td>${p ?? "-"}</td>
  <td>"-"</td>
</tr>`).join("");

    // -------------------
    // Alerts
    // -------------------
    const alerts = await prisma.alertLog.findMany({
      where: {
        customerTenantId: tenantId,
        receivedAt: { gte: start.toISOString(), lte: end.toISOString() },
      },
      select: { alertId: true,extraId:true, rawJson: true },
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
<td>${a.extraId ??"-"}</td>
  <td>${a.rawJson?.receivedAt ? new Date(a.rawJson.receivedAt).toLocaleString() : "-"}</td>
  <td>${a.rawJson?.severity ?? "-"}</td>
<td>${humanize(a.rawJson?.type)}</td>
  <td>${a.rawJson?.category ?? "-"}</td>
  <td>${a.rawJson?.details?.resourceName ?? "-"}</td>
  <td>${a.rawJson?.details?.verdict ?? "-"}</td>
</tr>`).join("");

    const formatDate = d =>
      d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

    const displayStartDate = formatDate(start);
    const displayEndDate = formatDate(end);

    let periodLabel = `Period: ${displayStartDate} – ${displayEndDate}`

    // Load images as base64
    const headerBase64 = `data:image/png;base64,${fs.readFileSync(
      path.join(__dirname, "../uploads/logo/header.png")
    ).toString("base64")}`;

    const footerBase64 = `data:image/png;base64,${fs.readFileSync(
      path.join(__dirname, "../uploads/logo/footer.png")
    ).toString("base64")}`;

    // // Main content HTML
    // const contentHtml = `
    // <table style="width:100%; border-collapse: collapse;">
    //   <tr><th>ID</th><th>Name</th><th>Value</th></tr>
    //   ${Array.from({ length: 100 }, (_, i) => 
    //     `<tr><td>${i + 1}</td><td>Item ${i + 1}</td><td>${(i + 1) * 10}</td></tr>`
    //   ).join("")}
    // </table>
    // `;


    const firstPageHTML = `
<html>
<head>
  <style>
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
    }

    .page {
      position: relative;
      width: 100%;
      height: 100vh;
    }

    .bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 1;
    }

    .title {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 2;
      text-align: center;
      color: #fff;
    }

    /* 3D TEXT EFFECT */
    .title h2,
    .title .sub,
    .title .period {
      color: #ffffff;
      text-shadow:
        1px 1px 0 rgba(0,0,0,0.3),
        2px 2px 0 rgba(0,0,0,0.25),
        3px 3px 6px rgba(0,0,0,0.6);
    }

    .title h2 {
      font-size: 32px;
      font-weight: 700;
      margin: 12px;
    }

    .title .sub {
      font-size: 26px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .title .period {
      font-size: 18px;
      font-weight: 500;
      opacity: 0.95;
    }
  </style>
</head>

<body>
  <div class="page">
    <img src="${firstPageImg}" class="bg" />

    <div class="title">
      <h2>Customer Security Report</h2>
      <div class="sub">${customer.acronisCustomerTenantName ?? ""}</div>
      <div class="period">Report Period: ${periodLabel}</div>
    </div>
  </div>
</body>
</html>
`;


    const firstPagePDF = await pdf.generatePdf(
      { content: firstPageHTML },
      { format: "A4", printBackground: true }
    );

    // Header & footer templates
    const headerTemplate = `
<div style="width:100%; text-align:center;">
  <img src="${headerBase64}" style="width:100%; max-height:100px;margin-top:-15px; padding-top:0px" />
</div>
`;

    const footerTemplate = `
<div style="width:100%; text-align:center; font-size:12px; color:#555;margin-bottom:-18px; padding-bottom:0px">
  <img src="${footerBase64}" style="width:100%; max-height:70px;" />
</div>
`;
    const contentHtml = `
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

${chartImage ? `<img src="${chartImage}" />` : ""}
<div class="page-break"></div>
${deviceImage ? `<img src="${deviceImage}" />` : ""}
<h3>Device List</h3>
<table>
<thead>
<tr><th>Hostname</th><th>OS</th><th>Status</th><th>Enabled</th><th>Registered</th></tr>
</thead>
<tbody>${deviceRows}</tbody>
</table>

<h3>Active Plan</h3>
<table>
<thead>
<tr><th>Plan Name</th><th>Device Count</th></tr>
</thead>
<tbody>${planRows}</tbody>
</table>


<h3>Active Policies</h3>
<table>
<thead>
<tr><th>Policy Name</th><th>Policy Enabled</th></tr>
</thead>
<tbody>${policyRows}</tbody>
</table>



<h3>Alert Details</h3>
<table>
<thead>
<tr><th>Alert ID</th><th>Received</th><th>Severity</th><th>Type</th><th>Category</th><th>Resource</th><th>Verdict</th></tr>
</thead>
<tbody>${alertRows}</tbody>
</table>

</body>
</html>


`;


    /* =====================================================
             3️⃣ LAST PAGE (FULL IMAGE, NO HEADER / FOOTER)
          ===================================================== */
    const endPageHTML = `
          <html>
            <body style="margin:0">
              <img src="${endPageImg}"
                   style="width:100%;height:100vh;object-fit:cover" />
            </body>
          </html>
        `;

    const endPagePDF = await pdf.generatePdf(
      { content: endPageHTML },
      { format: "A4", printBackground: true }
    );

    const options = {
      format: "A4",
      printBackground: true,
      margin: {
        top: "120px",   // leave space for header
        bottom: "120px", // leave space for footer
        left: "10mm",
        right: "10mm",
      },
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
    };
    // Generate PDF

    (async () => {
      try {
        /* ---------------- GENERATE CONTENT PDF ---------------- */
        const file = { content: contentHtml };
        const contentPDF = await pdf.generatePdf(file, options);

        /* ---------------- CREATE FINAL PDF ---------------- */
        const finalPdf = await PDFDocument.create();
        const mergedPages = [];

        for (const buffer of [firstPagePDF, contentPDF, endPagePDF]) {
          const pdfDoc = await PDFDocument.load(buffer);
          const pages = await finalPdf.copyPages(
            pdfDoc,
            pdfDoc.getPageIndices()
          );
          pages.forEach((p) => {
            finalPdf.addPage(p);
            mergedPages.push(p);
          });
        }

        /* ---------------- TOC LINKS ---------------- */
        const TOC_PAGE_INDEX = 1;       // Page 2
        const SECTION1_PAGE_INDEX = 2;  // Page 3
        const SECTION2_PAGE_INDEX = 4;  // Page 5

        // const tocPage = mergedPages[TOC_PAGE_INDEX];

        // const tocLinks = [
        //   { y: 650, target: SECTION1_PAGE_INDEX },
        //   { y: 620, target: SECTION2_PAGE_INDEX },
        // ];

        // tocLinks.forEach((item) => {
        //   tocPage.drawRectangle({
        //     x: 50,
        //     y: item.y,
        //     width: 400,
        //     height: 18,
        //     opacity: 0,
        //     link: mergedPages[item.target],
        //   });
        // });

        /* ---------------- FINAL PDF BUFFER ---------------- */
        const finalPdfBytes = await finalPdf.save();
        const finalPdfBuffer = Buffer.from(finalPdfBytes);

        /* ---------------- FILE SYSTEM SAVE ---------------- */
        const customerFolder = path.join(UPLOAD_BASE, String(customerId));
        if (!fs.existsSync(customerFolder)) {
          fs.mkdirSync(customerFolder, { recursive: true });
        }

        const invoiceNo = `INV-${Date.now()}`;
        const fileName = `${invoiceNo}.pdf`;
        const filePath = path.join(customerFolder, fileName);

        fs.writeFileSync(filePath, finalPdfBuffer);

        /* ---------------- SAVE REPORT TO DB ---------------- */
        const reportRecord = await prisma.report.create({
          data: {
            customerId: Number(customerId),
            startDate: start,
            endDate: end,
            generated: true,
            category: "mdr",
            type: downloadMode,
            mailto: contact?.email ?? null,
            mailcc: cc?.length ? cc : null,
            terms: 30,
            paymentStatus: "pending",
            invoicePath: {
              fileName,
              path: `uploads/reports/${customerId}/${fileName}`,
            },
          },
        });

        /* ---------------- RESPONSE HANDLING ---------------- */

        // 🔹 Manual download
        if (downloadMode === "manual") {
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${fileName}"`
          );
          res.setHeader("Content-Length", finalPdfBuffer.length);
          return res.send(finalPdfBuffer);
        }

        // 🔹 Auto email
        if (downloadMode === "auto") {
          await sendMail({
            to: contact?.email,
            cc,
            attachment: finalPdfBuffer,
          });

          return res.json({
            success: true,
            reportId: reportRecord.id,
            message: "Report generated & emailed successfully",
          });
        }

        // 🔹 Forward
        if (downloadMode === "forward") {
          if (!to) {
            return res.status(400).json({ error: "`to` email required" });
          }

          await sendMail({
            to,
            cc,
            attachment: finalPdfBuffer,
          });

          return res.json({
            success: true,
            reportId: reportRecord.id,
            message: "Report forwarded successfully",
          });
        }

        // 🔹 Inline preview
        const stream = new Readable();
        stream.push(finalPdfBuffer);
        stream.push(null);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
        stream.pipe(res);
      } catch (err) {
        console.error(err);
        return res.status(500).send("PDF generation failed");
      }
    })();

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


const list = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const searchKeyword = req.query.searchKeyword || '';
    const { id } = req.query;

    if (isNaN(Number(id))) {
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ error: ERROR_MESSAGES.BAD_REQUEST });
    }

    const skip = (page - 1) * limit;

    let whereCondition = {
      customerId: Number(id),
    };

    // ✅ If search keyword is date (YYYY-MM-DD)
    if (searchKeyword) {
      const parsedDate = new Date(searchKeyword);

      if (!isNaN(parsedDate.getTime())) {
        const startOfDay = new Date(parsedDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(parsedDate);
        endOfDay.setHours(23, 59, 59, 999);

        whereCondition.startDate = {
          gte: startOfDay,
          lte: endOfDay,
        };
      }
    }

    const [totalCount, contacts] = await Promise.all([
      prisma.report.count({ where: whereCondition }),
      prisma.report.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { id: "desc" },
        select: {
          id: true,
          customerId: true,
          startDate: true,
          endDate: true,
          terms: true,
          paymentStatus: true,
          invoicePath: true,
          type: true
        },
      }),
    ]);

    return res.status(STATUS_CODES.OK).json({
      data: contacts,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        pageSize: limit,
      },
    });
  } catch (error) {
    console.error(error);
    return res
      .status(STATUS_CODES.INTERNAL_ERROR)
      .json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
  }
};

const deletes = async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(parseInt(id))) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({ error: ERROR_MESSAGES.BAD_REQUEST });
    }

    await prisma.report.delete({
      where: {
        id: parseInt(id),
      },
    });

    res.status(STATUS_CODES.NO_CONTENT).send();
  } catch (error) {
    console.error(error);
    res.status(STATUS_CODES.INTERNAL_ERROR).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
  }
};

module.exports = { deletes, generateCustomerReport, getAlertReport, getDeviceReport, list };
