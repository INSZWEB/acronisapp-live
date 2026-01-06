const pdf = require("html-pdf-node");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");

/* ===============================
   PATH SETUP
================================ */
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const loadBase64 = (p) =>
  `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}`;

/* ===============================
   LOAD IMAGES
================================ */
const firstPageImg = loadBase64("uploads/logo/firstpage.png");
const headerImg = loadBase64("uploads/logo/header.jpg");
const footerImg = loadBase64("uploads/logo/footer.jpg");
const endPageImg   = loadBase64("uploads/logo/endpage.png");

/* ===============================
   MAIN
================================ */
(async () => {
  try {
    /* =====================================================
       1️⃣ FIRST PAGE (FULL IMAGE + CENTER TITLE)
    ===================================================== */
    const firstPageHTML = `
    <html>
    <head>
      <style>
        body { margin:0; }
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
          align-items: center;
          justify-content: center;
          z-index: 2;
          text-align: center;
        }
        .title h1 {
          color: #fff;
          font-size: 42px;
          text-shadow: 2px 2px 8px rgba(0,0,0,0.6);
          margin: 0;
        }
      </style>
    </head>
    <body>
      <div class="page">
        <img src="${firstPageImg}" class="bg" />
        <div class="title">
          <h1>Annual Report 2026</h1>
        </div>
      </div>
    </body>
    </html>
    `;

    const firstPagePDF = await pdf.generatePdf(
      { content: firstPageHTML },
      { format: "A4", printBackground: true }
    );

    /* =====================================================
       2️⃣ CONTENT PAGES (TOC + TABLES WITH HEADER & FOOTER)
    ===================================================== */
    const contentHTML = `
<style>
  table { width:100%; border-collapse:collapse; }
  th, td { border:1px solid #000; padding:6px; }
</style>

<!-- TOC PAGE -->
<h2>Table of Contents</h2>
<table>
  <tr><td>1. Sales Report</td><td align="right">3</td></tr>
  <tr><td>2. Customer Analysis</td><td align="right">5</td></tr>
</table>
<div style="page-break-after:always"></div>

<!-- SECTION 1 -->
<h2>1. Sales Report</h2>
<table>
  ${Array.from({ length: 20 }, (_, i) => `
    <tr><td>${i + 1}</td><td>Item ${i + 1}</td><td>${(i+1)*100}</td></tr>
  `).join('')}
</table>
<div style="page-break-after:always"></div>

<!-- SECTION 2 -->
<h2>2. Customer Analysis</h2>
<table>
  ${Array.from({ length: 20 }, (_, i) => `
    <tr><td>${i + 1}</td><td>Customer ${i + 1}</td><td>${(i+1)*50}</td></tr>
  `).join('')}
</table>
`;

    const contentPDF = await pdf.generatePdf(
      { content: contentHTML },
      {
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        margin: {
          top: "120px",
          bottom: "120px",
          left: "10mm",
          right: "10mm",
        },
        headerTemplate: `
          <div style="width:100%; text-align:center;">
  <img src="${headerImg}" style="width:100%; max-height:100px;margin-top:-15px; padding-top:0px" />
</div>
        `,
        footerTemplate: `
          <div style="width:100%; text-align:center; font-size:12px; color:#555;margin-bottom:-18px; padding-bottom:0px">
  <img src="${footerImg}" style="width:100%; max-height:70px;" />
</div>
        `,
      }
    );


    
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
    /* =====================================================
       3️⃣ MERGE PDFs + ADD CLICKABLE TOC LINKS
    ===================================================== */
    const finalPdf = await PDFDocument.create();
    const mergedPages = [];

    for (const buffer of [firstPagePDF, contentPDF, endPagePDF]) {
      const pdfDoc = await PDFDocument.load(buffer);
      const pages = await finalPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      pages.forEach((p) => {
        finalPdf.addPage(p);
        mergedPages.push(p);
      });
    }

    // TOC page = page 2 (index 1)
    const TOC_PAGE_INDEX = 1;
    const SECTION1_PAGE_INDEX = 2; // Page 3
    const SECTION2_PAGE_INDEX = 4; // Page 5

    const tocPage = mergedPages[TOC_PAGE_INDEX];

    // Positions of TOC rows (adjust Y if needed)
    const tocLinks = [
      { y: 650, target: SECTION1_PAGE_INDEX }, // Sales Report
      { y: 620, target: SECTION2_PAGE_INDEX }, // Customer Analysis
    ];

    tocLinks.forEach((item) => {
      tocPage.drawRectangle({
        x: 50,
        y: item.y,
        width: 400,
        height: 18,
        opacity: 0,
        link: mergedPages[item.target],
      });
    });

    const outputPath = path.join(uploadDir, "output.pdf");
    fs.writeFileSync(outputPath, await finalPdf.save());

    console.log("✅ PDF created with clickable TOC links:", outputPath);

  } catch (err) {
    console.error("❌ Error:", err);
  }
})();
