const { exec } = require("child_process");
const path = require("path");

const inputPdf = path.join(__dirname, "../uploads/input.pdf");
const outputDir = path.join(__dirname, "../uploads");

exec(
  `"soffice" --headless --convert-to docx "${inputPdf}" --outdir "${outputDir}"`,
  (error, stdout, stderr) => {
    if (error) {
      console.error("Conversion failed:", error);
      return;
    }
    console.log("PDF converted to DOCX successfully!");
  }
);
