const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

/* ===============================
   IMAGE HELPERS
================================ */
const img64 = (p) =>
  `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;

const coverImg  = img64("uploads/logo/firstpage.png");
const headerImg = img64("uploads/logo/header.jpg");
const footerImg = img64("uploads/logo/footer.jpg");
const endImg    = img64("uploads/logo/endpage.png");

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  await page.setContent(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>

<style>
@page { size: A4; margin: 0; }
body { margin:0; font-family: Arial, Helvetica, sans-serif; }

/* ===== GLOBAL ===== */
.page {
  width: 210mm;
  height: 297mm;
  position: relative;
  page-break-after: always;
}

.page:last-child {
  page-break-after: auto;
}


/* ===== COVER & END ===== */
.cover img,
.end img {
  width:100%;
  height:100%;
  object-fit:cover;
}

/* ===== HEADER / FOOTER ===== */
.header {
  position: absolute;
  top:0;
  left:0;
  width:100%;
  height:100px;
}

.footer {
  position: absolute;
  bottom:0;
  left:0;
  width:100%;
  height:80px;
}

.header img,
.footer img {
  width:100%;
  height:100%;
}

/* ===== CONTENT PAGE ===== */
.content {
  padding: 120px 20mm 90px;
}

h1 {
  page-break-before: always;
  color:#333;
}

/* ===== TOC ===== */
#toc a {
  display:flex;
  justify-content:space-between;
  margin:12px 0;
  text-decoration:none;
  color:#004a99;
  border-bottom:1px dotted #ccc;
}

/* Hide header/footer on cover & end */
.cover .header,
.cover .footer,
.end .header,
.end .footer {
  display:none;
}
</style>
</head>

<body>

<!-- ================= COVER ================= -->
<div class="page cover">
  <img src="${coverImg}">
</div>

<!-- ================= CONTENT PAGE 1 (TOC) ================= -->
<div class="page">
  <div class="header"><img src="${headerImg}"></div>
  <div class="footer"><img src="${footerImg}"></div>

  <div class="content">
    <h2>Table of Contents</h2>
    <div id="toc">
      <a href="#s1"><span>1. Executive Summary</span><span>3</span></a>
      <a href="#s2"><span>2. Financial Overview</span><span>4</span></a>
      <a href="#s3"><span>3. Future Outlook</span><span>5</span></a>
    </div>
  </div>
</div>

<!-- ================= SECTION 1 ================= -->
<div class="page">
  <div class="header"><img src="${headerImg}"></div>
  <div class="footer"><img src="${footerImg}"></div>

  <div class="content">
    <h1 id="s1">1. Executive Summary</h1>
    <p>TOC link jumps here correctly.</p>
  </div>
</div>

<!-- ================= SECTION 2 ================= -->
<div class="page">
  <div class="header"><img src="${headerImg}"></div>
  <div class="footer"><img src="${footerImg}"></div>

  <div class="content">
    <h1 id="s2">2. Financial Overview</h1>
    <p>More content here.</p>
  </div>
</div>

<!-- ================= SECTION 3 ================= -->
<div class="page">
  <div class="header"><img src="${headerImg}"></div>
  <div class="footer"><img src="${footerImg}"></div>

  <div class="content">
    <h1 id="s3">3. Future Outlook</h1>
    <p>Conclusion content.</p>
  </div>
</div>

<!-- ================= END PAGE ================= -->
<div class="page end">
  <img src="${endImg}">
</div>

</body>
</html>
`, { waitUntil: "networkidle0" });

  await page.pdf({
    path: "uploads/final_report.pdf",
    format: "A4",
    printBackground: true
  });

  await browser.close();
  console.log("✅ final_report.pdf generated with WORKING TOC links");
})();
