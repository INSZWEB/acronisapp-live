const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * Generate PPT for either customer or partner
 * @param {Object} options
 * @param {number} [options.customerId] - optional customerId
 * @param {number} [options.parnterId] - optional parnterId
 * @param {string} options.name - name to put in PPT
 */
function generatePpt({ customerId, parnterId, name }) {
  return new Promise((resolve, reject) => {
    console.log("STEP 1 ▶ generatePpt called");
    console.log("customerId:", customerId, "parnterId:", parnterId, "name:", name);

    const isCustomer = !!customerId;
    const id = customerId || parnterId;

    if (!id) return reject("❌ customerId or parnterId is required");

    // 📁 Base paths
    const uploadsDir = path.resolve(__dirname, "../uploads");
    const pptBaseDir = path.join(uploadsDir, "ppt");
    const folderType = isCustomer ? "customer" : "parnter"; // <-- folder type
    const targetDir = path.join(pptBaseDir, folderType, String(id));

    // 📄 Files
    const inputPpt = path.join(uploadsDir, "input.pptx");
    const outputPpt = path.join(targetDir, `kickoff_${id}.pptx`);

    const pythonScript = path.resolve(__dirname, "../python/edit_ppt.py");

    // 🔴 Validate required files
    if (!fs.existsSync(inputPpt)) return reject("❌ input.pptx NOT FOUND");
    if (!fs.existsSync(pythonScript)) return reject("❌ edit_ppt.py NOT FOUND");

    // 📁 Create directories if missing
    if (!fs.existsSync(pptBaseDir)) fs.mkdirSync(pptBaseDir);
    const folderPath = path.join(pptBaseDir, folderType);
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir);

    // Execute Python
    exec(
      `python "${pythonScript}" "${inputPpt}" "${outputPpt}" "${name}"`,
      (error, stdout, stderr) => {
        if (stdout) console.log("PYTHON STDOUT:", stdout);
        if (stderr) console.error("PYTHON STDERR:", stderr);

        if (error) return reject(error.message);
        if (!fs.existsSync(outputPpt)) return reject("❌ PPT NOT CREATED by Python");

        resolve({
          fullPath: outputPpt,
          relativePath: `/uploads/ppt/${folderType}/${id}/kickoff_${id}.pptx`,
        });
      }
    );
  });
}

module.exports = { generatePpt };
