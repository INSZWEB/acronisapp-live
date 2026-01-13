const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const fs = require("fs");
const path = require("path");

async function generateDocx({ customerId, year }) {
  const inputPath = path.resolve(__dirname, "../uploads", "input.docx");

  const outputFileName = `kickoff_${customerId}.docx`;
  const outputPath = path.resolve(__dirname, "../uploads", outputFileName);

  const content = fs.readFileSync(inputPath, "binary");
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.render({ year });

  const buffer = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  fs.writeFileSync(outputPath, buffer);

  return {
    fileName: outputFileName,
    fullPath: outputPath,
    relativePath: `/uploads/${outputFileName}`,
  };
}

module.exports = { generateDocx };
