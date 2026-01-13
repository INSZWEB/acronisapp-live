const { exec } = require("child_process");
const path = require("path");

const pptPath = path.join(__dirname, "../uploads", "input.pptx");
const nameToAdd = "ICS Asia";
const saveAsNew = true;

exec(
  `python "${path.join(__dirname, "edit_ppt.py")}" "${pptPath}" "${nameToAdd}" "${saveAsNew}"`,
  (error, stdout, stderr) => {
    if (error) {
      console.error("Error:", error);
      console.error("STDERR:", stderr); // <-- log Python error
      return;
    }
    console.log("STDOUT:", stdout);
  }
);
