const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const fs = require("fs");
const path = require("path");

/**
 * Generate DOCX for either customer or partner
 * @param {Object} options
 * @param {number} [options.customerId] - optional customerId
 * @param {number} [options.parnterId] - optional parnterId
 * @param {string} options.year - year to render in doc
 */
async function generateDocx({ customerId, parnterId, year }) {
  const isCustomer = !!customerId;
  const id = customerId || parnterId;

  if (!id) throw new Error("customerId or parnterId is required");

  // 📁 Base paths
  const uploadsDir = path.resolve(__dirname, "../uploads");
  const docxBaseDir = path.join(uploadsDir, "docx");
  const folderType = isCustomer ? "customer" : "parnter";
  const targetDir = path.join(docxBaseDir, folderType, String(id));

  // Create directories if missing
  if (!fs.existsSync(docxBaseDir)) fs.mkdirSync(docxBaseDir);
  const folderPath = path.join(docxBaseDir, folderType);
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir);

  // Files
  const inputPath = path.join(uploadsDir, "input.docx");
  const outputFileName = `kickoff_${id}.docx`;
  const outputPath = path.join(targetDir, outputFileName);

  // Read and render template
  const content = fs.readFileSync(inputPath, "binary");
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render({ year });

  const buffer = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(outputPath, buffer);

  return {
    fileName: outputFileName,
    fullPath: outputPath,
    relativePath: `/uploads/docx/${folderType}/${id}/${outputFileName}`,
  };
}

module.exports = { generateDocx };
