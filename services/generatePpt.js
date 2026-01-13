const { exec } = require("child_process");
const path = require("path");

function generatePpt({ customerId, name }) {
  return new Promise((resolve, reject) => {
    const inputPpt = path.resolve(__dirname, "../uploads/input.pptx");
    const outputPpt = path.resolve(
      __dirname,
      `../uploads/kickoff_${customerId}.pptx`
    );

    const pythonScript = path.resolve(__dirname, "../python/edit_ppt.py");

    exec(
      `python "${pythonScript}" "${inputPpt}" "${outputPpt}" "${name}"`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(stderr);
          return reject(stderr || error.message);
        }

        resolve({
          fullPath: outputPpt,
          relativePath: `/uploads/kickoff_${customerId}.pptx`,
        });
      }
    );
  });
}

module.exports = { generatePpt };
