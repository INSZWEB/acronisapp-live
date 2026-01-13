const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const fs = require("fs");
const path = require("path");

const inputPath = path.resolve(__dirname, "uploads", "input.docx");
const outputPath = path.resolve(__dirname, "uploads", "output.docx");

try {
    const content = fs.readFileSync(inputPath, "binary");
    const zip = new PizZip(content);

    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });

    // Simple string replacement
    // Word will keep the bold style if {year} is bold in the template
    doc.render({
        year: "2026"
    });

    const buf = doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
    });

    fs.writeFileSync(outputPath, buf);
    console.log("Success! File updated at:", outputPath);

} catch (error) {
    console.error("Error updating docx:", JSON.stringify(error, null, 2));
}