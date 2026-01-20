// reportGenerator.js
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const sharp = require("sharp");
const express = require("express");
const bodyParser = require("body-parser");
const router = require("./moduleRoutes");

const app = express();
app.use(bodyParser.json({ limit: "50mb" }));

const UPLOAD_BASE = path.join(process.cwd(), "uploads", "reports");

/* ===============================
   PAGE & LAYOUT CONFIG (mm -> px)
=================================*/
const pxPerMm = 96 / 25.4;
const pageWidthMm = 210;
const pageHeightMm = 297;
const marginLeftMm = 20;
const marginRightMm = 20;
const headerHeightMm = 28;
const footerHeightMm = 20;
const contentPaddingTopMm = 10;
const contentPaddingBottomMm = 10;

const contentWidthMm = pageWidthMm - marginLeftMm - marginRightMm;
const contentHeightMm =
  pageHeightMm - headerHeightMm - footerHeightMm - contentPaddingTopMm - contentPaddingBottomMm;

const contentWidthPx = Math.round(contentWidthMm * pxPerMm);
const contentHeightPx = Math.round(contentHeightMm * pxPerMm);

/* ===============================
   Image slicing helper
=================================*/
async function sliceImageToPageSlices(imageSource, bottomCropPx = 0) {
  if (!imageSource) return [];

  const imageBottomGapPx = 24; // footer-safe gap

  let buffer;
  if (imageSource.startsWith("data:")) {
    buffer = Buffer.from(imageSource.split(",")[1], "base64");
  } else if (fs.existsSync(imageSource)) {
    buffer = fs.readFileSync(imageSource);
  } else {
    return [];
  }

  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) return [];

  // 🛑 SAFETY: prevent negative crop
  const safeBottomCrop = Math.min(bottomCropPx, meta.height - 1);
  const cropHeight = meta.height - safeBottomCrop;

  let workingBuffer = buffer;

  if (safeBottomCrop > 0 && cropHeight > 1) {
    workingBuffer = await sharp(buffer)
      .extract({
        left: 0,
        top: 0,
        width: meta.width,
        height: cropHeight,
      })
      .toBuffer();
  }

  // Resize to content width
  const scale = contentWidthPx / meta.width;
  const resizedHeight = Math.round(cropHeight * scale);

  const resized = await sharp(workingBuffer)
    .resize({ width: contentWidthPx })
    .png()
    .toBuffer();

  const resizedMeta = await sharp(resized).metadata();
  if (!resizedMeta.height) return [];

  const usableHeight = Math.max(1, contentHeightPx - imageBottomGapPx);

  // Single page
  if (resizedMeta.height <= usableHeight) {
    return [`data:image/png;base64,${resized.toString("base64")}`];
  }

  // Multi-page slicing
  const slices = [];
  let offset = 0;

  while (offset < resizedMeta.height) {
    const sliceHeight = Math.min(
      usableHeight,
      resizedMeta.height - offset
    );

    // 🛑 SAFETY CHECK
    if (sliceHeight <= 0) break;

    const chunk = await sharp(resized)
      .extract({
        left: 0,
        top: offset,
        width: contentWidthPx,
        height: sliceHeight,
      })
      .png()
      .toBuffer();

    slices.push(`data:image/png;base64,${chunk.toString("base64")}`);

    offset += sliceHeight;
  }

  return slices;
}

function policyNameFromType(type) {
  if (!type) return "-"; // Return "-" if type is empty or null
  return type
    .split(".")                    // Split by dots
    .pop()                         // Take the last segment
    .replace(/_/g, " ")            // Replace underscores with spaces
    .replace(/\b\w/g, c => c.toUpperCase()); // Capitalize first letter of each word
}

function buildPlanPolicyMatrix(plans, policies) {
  return plans.map(plan => {
    const matchedPolicies = policies.filter(
      p => p.agentId === plan.agentId
    );

    return {
      planName: plan.planName ?? plan.planType,
      policies: matchedPolicies.map(p => ({
        policyName: policyNameFromType(p.planType),
        enabled: p.enabled === true
      }))
    };
  });
}
function planPolicyTableHTML(plans, policies) {
  const matrix = buildPlanPolicyMatrix(plans, policies);

  if (!matrix.length) {
    return `<p>No policies available</p>`;
  }

  return `
<table class="data-table">
  <thead>
    <tr>
      <th style="width:35%;">Plan Name</th>
      <th style="width:45%;">Policy Name</th>
      <th style="width:20%; text-align:center;">Status</th>
    </tr>
  </thead>
  <tbody>
    ${matrix.map(group => {
    if (!group.policies.length) {
      return `
        <tr>
          <td>${group.planName}</td>
          <td>-</td>
          <td style="text-align:center;">❌</td>
        </tr>`;
    }

    return group.policies.map((p, idx) => `
        <tr>
          ${idx === 0
        ? `<td rowspan="${group.policies.length}" style="vertical-align:middle;">
                ${group.planName}
              </td>`
        : ""}
          <td>${p.policyName}</td>
          <td style="text-align:center; font-size:14pt;">
            ${p.enabled ? "✅" : "❌"}
          </td>
        </tr>
      `).join("");
  }).join("")}
  </tbody>
</table>
`;
}

function dedupePlansByName(plans) {
  const map = new Map();

  for (const p of plans) {
    if (!p.planName) continue;

    const existing = map.get(p.planName);

    // keep latest by createdAt
    if (
      !existing ||
      new Date(p.createdAt) > new Date(existing.createdAt)
    ) {
      map.set(p.planName, p);
    }
  }

  return Array.from(map.values());
}

/* ===============================
   Table helpers
=================================*/
function generateRecords(count, prefix = "Device") {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `${prefix} ${i + 1}`,
    type: `Type ${(i % 5) + 1}`,
    status: i % 2 === 0 ? "Active" : "Inactive",
    value: (Math.random() * 10000).toFixed(2),
  }));
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Table HTML with clickable links to page anchors
function tableHTML(rows, sectionPrefix = "page-table") {
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width:6%;">#</th>
          <th style="width:48%;">Name</th>
          <th style="width:18%;">Type</th>
          <th style="width:14%;">Status</th>
          <th style="width:14%;">Value</th>
        </tr>
      </thead>
      <tbody>
        ${rows
      .map(
        (r) => `
          <tr>
            <td>${r.id}</td>
            <td>
              <a href="#${sectionPrefix}-${r.id}" style="color:blue;text-decoration:underline;">
                ${r.name}
              </a>
            </td>
            <td>${r.type}</td>
            <td>${r.status}</td>
            <td style="text-align:right;">${r.value}</td>
          </tr>
        `
      )
      .join("")}
      </tbody>
    </table>
  `;
}

function buildPolicyRows(plans, policies) {
  const rows = [];

  plans.forEach(plan => {
    const matched = policies.filter(p => p.agentId === plan.agentId);

    if (!matched.length) {
      rows.push({
        planName: plan.planName ?? plan.planType,
        policyName: "-",
        enabled: false,
        rowspan: 1,
        isFirst: true
      });
      return;
    }

    matched.forEach((p, index) => {
      rows.push({
        planName: plan.planName ?? plan.planType,
        policyName: policyNameFromType(p.planType),
        enabled: p.enabled,
        rowspan: index === 0 ? matched.length : 0,
        isFirst: index === 0
      });
    });
  });

  return rows;
}

function policyTableHTML(rows) {
  return `
<table class="data-table">
  <thead>
    <tr>
      <th style="width:35%;">Plan Name</th>
      <th style="width:45%;">Policy Name</th>
      <th style="width:20%; text-align:center;">Status</th>
    </tr>
  </thead>
  <tbody>
    ${rows.map(r => `
      <tr>
        ${r.isFirst && r.rowspan
      ? `<td rowspan="${r.rowspan}" style="vertical-align:middle;">${r.planName}</td>`
      : ""}
        ${!r.isFirst ? "" : ""}
        <td>${r.policyName}</td>
        <td style="text-align:center;">${r.enabled ? "✅" : "❌"}</td>
      </tr>
    `).join("")}
  </tbody>
</table>
`;
}

function buildPlanMap(plans) {
  const map = new Map();
  plans.forEach(p => {
    if (p.agentId && p.planName) {
      map.set(p.agentId, p.planName);
    }
  });
  return map;
}





/* ===============================
   Main PDF endpoint
=================================*/
router.post("/generate", async (req, res) => {
  try {
    const { customerId, chartImage, summaryD, DImage, patchImage, deviceSummaries = [], range, downloadMode = "manual", to, cc = [], reportType, } = req.body;
    if (!customerId) return res.status(400).json({ error: "customerId required" });

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

    console.log("devices", devices)
    const policies = await prisma.policy.findMany({
      where: {
        customerTenantId: tenantId, agentId: {
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
    const uniquePlans = dedupePlansByName(plan);
    const planMap = buildPlanMap(plan);
    const policyRows = buildPolicyRows(uniquePlans, policies);
    const policyChunks = chunkArray(policyRows, 32);

    // Build agentId → planName map
    const planMap1 = new Map(
      plan.map(p => [p.agentId, p.planName])
    );

    // Build device rows
    const deviceRows = devices.map(d => `
<tr>
  <td>${d.hostname ?? "-"}</td>
  <td>${d.osFamily === "WINDOWS" ? "🪟 Windows" : d.osFamily ?? "-"}</td>
  <td>
    <span class="status ${d.online ? "online" : "offline"}">
      ${d.online ? "Online" : "Offline"}
    </span>
  </td>
  <td>${planMap1.get(d.agentId) ?? "-"}</td>
  <td>${new Date(d.registrationDate ?? d.createdAt).toLocaleString()}</td>
</tr>
`);
    const deviceChunks = chunkArray(deviceRows, 32); // rows per page
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
    const alerts = await prisma.alertLog.findMany({
      where: {
        customerTenantId: tenantId,
        receivedAt: { gte: start.toISOString(), lte: end.toISOString() },
      },
      select: { alertId: true, extraId: true, rawJson: true },
      orderBy: { id: "desc" },
    });

      const incidents = await prisma.incidentLog.findMany({
      where: {
        customerId: tenantId,
        receivedAt: { gte: start.toISOString(), lte: end.toISOString() },
      },
      select: {severity:true,state:true,host:true, incidentId: true, extraId: true, rawPayload: true,receivedAt:true },
      orderBy: { id: "desc" },
    });

    const alertRows = alerts
      .filter(a => a.rawJson?.category !== "EDR")
      .map(a => `
    <tr>
      <td>${a.extraId ?? "-"}</td>
      <td>
        ${a.rawJson?.receivedAt
          ? new Date(a.rawJson.receivedAt).toLocaleString()
          : "-"
        }
      </td>
      <td class="severity ${a.rawJson?.severity ?? ""}">
        ${a.rawJson?.severity ?? "-"}
      </td>
      <td>${humanize(a.rawJson?.type)}</td>
      <td>${a.rawJson?.category ?? "-"}</td>
      <td>${a.rawJson?.details?.resourceName ?? "-"}</td>
    </tr>
  `);


    const alertTableHTML = (rows) => `
<table class="data-table">
  <thead>
    <tr>
    <th>Alert ID</th>
      <th>Received At</th>
      <th>Severity</th>
      <th>Type</th>
      <th>Category</th>
      <th>Resource</th>
    </tr>
  </thead>
  <tbody>
    ${rows.join("")}
  </tbody>
</table>
`;


    const incidentRows = incidents
      .map(a => `
    <tr>
      <td>${a.extraId ?? "-"}</td>
      <td>
        ${a.receivedAt
          ? new Date(a.receivedAt).toLocaleString()
          : "-"
        }
      </td>
      <td class="severity">
        ${a.severity ?? "-"}
      </td>
      <td>${a.state ?? "-"}</td>
     <td> ${a.rawPayload?.mitigation_state ?? "-"}</td>
        <td>${a.host ?? "-"}</td>
    </tr>
  `);


    const incidentTableHTML = (rows) => `
<table class="data-table">
  <thead>
    <tr>
    <th>Alert ID</th>
      <th>Received At</th>
      <th>Severity</th>
      <th>State</th>
      <th>Migration</th>
      <th>Resource</th>
    </tr>
  </thead>
  <tbody>
    ${rows.join("")}
  </tbody>
</table>
`;
    console.log("alerts", alerts)
    // Utility function
    function humanize(str) {
      if (!str) return "-";

      // Fix common patterns like "U R L" -> "URL" and "P M" -> "PM"
      str = str.replace(/\b([A-Z])(?:\s+([A-Z]))+\b/g, (match) =>
        match.replace(/\s+/g, "")
      );

      // Capitalize first letter of each word
      str = str
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");

      return str;
    }

    const chartSlices = await sliceImageToPageSlices(chartImage, 80); // crop 80px footer from chart screenshot

    const patchSlices = await sliceImageToPageSlices(patchImage, 80);

    const records = generateRecords(150, "Device");
    const tableChunks = chunkArray(records, 25); // 25 rows per page
    const policyPlanTable = planPolicyTableHTML(plan, policies);

    const devicePages = chunkArray(deviceSummaries, 2);

    // Header/footer/cover/end images
    const coverImg = fs.existsSync("uploads/logo/firstpage.png")
      ? `data:image/png;base64,${fs.readFileSync("uploads/logo/firstpage.png").toString("base64")}`
      : "";
    const headerImg = fs.existsSync("uploads/logo/header.png")
      ? `data:image/png;base64,${fs.readFileSync("uploads/logo/header.png").toString("base64")}`
      : "";
    const footerImg = fs.existsSync("uploads/logo/footer.png")
      ? `data:image/png;base64,${fs.readFileSync("uploads/logo/footer.png").toString("base64")}`
      : "";
    const endImg = fs.existsSync("uploads/logo/endpage.png")
      ? `data:image/png;base64,${fs.readFileSync("uploads/logo/endpage.png").toString("base64")}`
      : "";


    // -------------------
    // Policy Rows
    // -------------------



    const alertChunks = chunkArray(alertRows, 32);
    const incidentChunks = chunkArray(incidentRows, 32);

    const devicePagesHtml = devicePages
      .map((pageImages, pageIndex) => {
        const imagesHtml = pageImages
          .map(
            (img) =>
              `<img src="${img.image}" class="img-group" />`
          )
          .join("");

        return `
      <div class="page">
        <div class="header">
          ${headerImg ? `<img src="${headerImg}" />` : ""}
        </div>

        <div class="footer">
          ${footerImg ? `<img src="${footerImg}" />` : ""}
        </div>

        <div class="content">
          <h1 id="section1-device">
            2.Endpoint Security Assessment Overview
          </h1>

          ${imagesHtml}
        </div>
      </div>
    `;
      })
      .join("");


    const formatDate = d =>
      d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

    const displayStartDate = formatDate(start);
    const displayEndDate = formatDate(end);

    let periodLabel = `Period: ${displayStartDate} – ${displayEndDate}`

    // Build HTML with Table of Contents
    const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
@page { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin:0; }
body { margin:0; font-family: Arial, sans-serif; }

.page { width:${pageWidthMm}mm; height:${pageHeightMm}mm; position:relative; page-break-after:always; box-sizing:border-box; }
.header { position:absolute; top:0; left:0; width:100%; height:${headerHeightMm}mm; }
.footer { position:absolute; bottom:0; left:0; width:100%; height:${footerHeightMm}mm; }
.header img, .footer img { width:100%; height:100%;  display:block; }

.content { 
  position:absolute; 
  left:${marginLeftMm}mm; 
  top:${headerHeightMm + contentPaddingTopMm}mm; 
  width:${contentWidthMm}mm; 
  height:${contentHeightMm - 10}px;
  overflow:visible;
}



.block { display:block; margin-bottom:16mm; page-break-inside:avoid; break-inside:avoid; }
.block img {
  display: block;
  width: 100%;
  height: auto;
}
.data-table {
  width:100%;
  border-collapse:collapse;
  font-size:11pt;
  page-break-inside:auto;
}

.data-table thead {
  display: table-header-group; /* REQUIRED */
}

.data-table tr {
  page-break-inside: avoid;
}
.data-table th, .data-table td { border:1px solid #ccc; padding:6px; }


.cover img, .end img { width:100%; height:100%; object-fit:cover; display:block; }

h1 { margin:0 0 6mm 0; font-size:18pt; }
h2 { margin:0 0 4mm 0; font-size:14pt; }

#toc { margin:10mm 0; }
#toc a { display:block; margin-bottom:3mm; font-size:12pt; color:#0645AD; text-decoration:underline; }
.toc-page {
  page-break-after: always;
}

.toc-title {
  text-align: center;
  margin-bottom: 40px;
  font-size: 28px;
  letter-spacing: 0.5px;
}

.toc-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-top: 30px;
}

.toc-item {
  display: flex;
  align-items: center;
  font-size: 16px;
}

.toc-number {
  width: 30px;
  font-weight: bold;
}

.toc-item a {
  text-decoration: none;
  color: #111;
  white-space: nowrap;
}

.toc-dots {
  flex: 1;
  border-bottom: 1px dotted #999;
  margin: 0 10px;
  height: 1px;
}

/* Optional hover (web only) */
.toc-item a:hover {
  text-decoration: underline;
}

.page-break {
  page-break-before: always;
}
  .cover {
  position: relative;
  width: ${pageWidthMm}mm;
  height: ${pageHeightMm}mm;
  page-break-after: always;
  overflow: hidden;
}

/* FULL PAGE IMAGE — Puppeteer safe */
.cover-img {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;

  width: 100%;
  height: 100%;

  object-fit: cover;
  z-index: 1;
}

.title {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  z-index: 2;
  text-align: center;
  color: #fff;
}

.cover::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
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
  font-size: 44px;
  font-weight: 700;
  margin-bottom: 12px;
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

.img-group {
  width: 100%;
  max-width: 100%;
  object-fit: contain;
  page-break-inside: avoid;
}
.data-table {
  font-size: 10px;        /* reduce overall table font */
}

.data-table th {
  font-size: 10.5px;
}

.data-table td {
  font-size: 10px;
  padding: 4px 6px;       /* tighter rows */
}

</style>
</head>
<body>

<!-- COVER -->
<!-- COVER -->
<div class="page cover">
  ${coverImg ? `<img src="${coverImg}" class="cover-img" />` : ""}

  <div class="title">
    <h2>InsightzMDR SUMMARY REPORT </h2>
    <div class="sub">${customer.acronisCustomerTenantName ?? ""}</div>
    <div class="period">Report Period: ${periodLabel}</div>
  </div>
</div>


<!-- TABLE OF CONTENTS -->
<div class="page toc-page">
  <div class="header">
    ${headerImg ? `<img src="${headerImg}" />` : ""}
  </div>

  <div class="footer">
    ${footerImg ? `<img src="${footerImg}" />` : ""}
  </div>

  <div class="content">
    <h1 class="toc-title">Table of Contents</h1>

    <div id="toc" class="toc-list">
      <div class="toc-item">
        <span class="toc-number">1</span>
        <a href="#section1">Alert Overview</a>
        <span class="toc-dots"></span>
      </div>

      <div class="toc-item">
        <span class="toc-number">2</span>
        <a href="#section1-device">Endpoint Security Assessment Overview</a>
        <span class="toc-dots"></span>
      </div>

      <div class="toc-item">
        <span class="toc-number">3</span>
        <a href="#section2">Endpoint List</a>
        <span class="toc-dots"></span>
      </div>

      <div class="toc-item">
        <span class="toc-number">4</span>
        <a href="#section3">Active Plan and Policy</a>
        <span class="toc-dots"></span>
      </div>

      <div class="toc-item">
        <span class="toc-number">5</span>
        <a href="#section4">Alert Summary</a>
        <span class="toc-dots"></span>
      </div>

      <div class="toc-item">
        <span class="toc-number">6</span>
        <a href="#section6">EDR Incident Details</a>
        <span class="toc-dots"></span>
      </div>

      <div class="toc-item">
        <span class="toc-number">7</span>
        <a href="#section7">All device patch details</a>
        <span class="toc-dots"></span>
      </div>
    </div>
  </div>
</div>


<!-- SECTION 1: charts -->

<div class="page">
  <div class="header">${headerImg ? `<img src="${headerImg}" />` : ""}</div>
  <div class="footer">${footerImg ? `<img src="${footerImg}" />` : ""}</div>
  <div class="content">
    <h1 id="section1">1.Alert Overview</h1>
    ${chartImage ? `<img src="${chartImage}"  class="img-group"/>` : ""}
    ${summaryD ? `<img  class="img-group" src="${summaryD}" />` : ""}
    ${DImage ? `<img class="img-group" src="${DImage}" />` : ""}
  </div>
</div>
      
<div class="page-break"></div>

   ${devicePagesHtml}

<div class="page-break"></div>


<!-- SECTION 2: Device Inventory -->
${deviceChunks.map((rows, idx) => `
<div class="page">
  <div class="header">${headerImg ? `<img src="${headerImg}" />` : ""}</div>
  <div class="footer">${footerImg ? `<img src="${footerImg}" />` : ""}</div>

  <div class="content">
    ${idx === 0 ? `<h1 id="section2">3.Endpoint List </h1>` : ""}

    <table class="data-table">
      <thead>
        <tr>
          <th>Hostname</th>
          <th>OS</th>
          <th>Status</th>
          <th>Plan</th>
          <th>Registered</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join("")}
      </tbody>
    </table>
  </div>
</div>
`).join("")}

<!-- SECTION 3: Policy Configuration -->
${policyChunks.map((rows, idx) => `
<div class="page">
  <div class="header">${headerImg ? `<img src="${headerImg}" />` : ""}</div>
  <div class="footer">${footerImg ? `<img src="${footerImg}" />` : ""}</div>
  <div class="content">
    ${idx === 0 ? `<h1 id="section3">4.Active Plan and Policy</h1>` : ""}
    ${policyTableHTML(rows)}
  </div>
</div>
`).join("")}


${alertChunks.map((rows, idx) => `
<div class="page">
  <div class="header">${headerImg ? `<img src="${headerImg}" />` : ""}</div>
  <div class="footer">${footerImg ? `<img src="${footerImg}" />` : ""}</div>

  <div class="content">
    ${idx === 0 ? `<h1 id="section4">5.Alert Summary</h1>` : ""}
    ${alertTableHTML(rows)}
  </div>
</div>
`).join("")}


${incidentChunks.map((rows, idx) => `
<div class="page">
  <div class="header">${headerImg ? `<img src="${headerImg}" />` : ""}</div>
  <div class="footer">${footerImg ? `<img src="${footerImg}" />` : ""}</div>

  <div class="content">
    ${idx === 0 ? `<h1 id="section6">6. EDR Incident Details</h1>` : ""}
    ${incidentTableHTML(rows)}
  </div>
</div>
`).join("")}


         <div class="page">
  <div class="header">${headerImg ? `<img src="${headerImg}" />` : ""}</div>
  <div class="footer">${footerImg ? `<img src="${footerImg}" />` : ""}</div>
  <div class="content">
   <h1 id="section7">7.All device patch details</h1>
    ${patchImage ? `<img src="${patchImage}"  class="img-group"/>` : ""}
  </div>
</div>
<!-- END PAGE -->
<div class="page end">${endImg ? `<img src="${endImg}" />` : ""}</div>

</body>
</html>
`;


    // ---------------- GENERATE PDF ----------------
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 0,
    });

    // ✅ Wait for all images (important for PDFs)
    await page.evaluate(async () => {
      const images = Array.from(document.images);
      await Promise.all(
        images.map(img => {
          if (img.complete) return;
          return new Promise(resolve => {
            img.onload = img.onerror = resolve;
          });
        })
      );
    });

    const finalPdfBuffer = await page.pdf({
      printBackground: true,
      width: `${pageWidthMm}mm`,
      height: `${pageHeightMm}mm`,
    });

    await browser.close();


    /* ---------------- FINAL PDF BUFFER ---------------- */
    const finalPdf = Buffer.from(finalPdfBuffer);

    /* ---------------- FILE SYSTEM SAVE ---------------- */
    const customerFolder = path.join(UPLOAD_BASE, String(customerId));
    if (!fs.existsSync(customerFolder)) {
      fs.mkdirSync(customerFolder, { recursive: true });
    }

    const invoiceNo = `INV-${Date.now()}`;
    const fileName = `${invoiceNo}.pdf`;
    const filePath = path.join(customerFolder, fileName);

    fs.writeFileSync(filePath, finalPdf);

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
      res.setHeader("Content-Length", finalPdf.length);
      return res.send(finalPdf);
    }

    // 🔹 Auto email
    if (downloadMode === "auto") {
      await sendMail({
        to: contact?.email,
        cc,
        attachment: finalPdf,
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
        attachment: finalPdf,
      });

      return res.json({
        success: true,
        reportId: reportRecord.id,
        message: "Report forwarded successfully",
      });
    }

    // 🔹 Inline preview
    const stream = new Readable();
    stream.push(finalPdf);
    stream.push(null);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${fileName}"`
    );

    return stream.pipe(res);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "PDF generation failed", details: String(err) });
  }
});

module.exports = router;
