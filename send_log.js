const fs = require("fs");
const path = require("path");
const dgram = require("dgram");

// -------------------- CONFIG --------------------
const LOG_DIR = "/var/log/acronis_edr";
const SIEM_IP = "129.126.253.51";
const SIEM_PORT = 514;

// -------------------- SEND LOG TO SIEM --------------------
function sendToSIEM(cefMsg) {
    const client = dgram.createSocket("udp4");
    const message = Buffer.from(cefMsg, "utf8");

    client.send(message, SIEM_PORT, SIEM_IP, (err) => {
        if (err) {
            console.error("❌ Error sending log:", err.message);
        } else {
            console.log(`📤 Sent log to SIEM: ${cefMsg.substring(0, 50)}...`);
        }
        client.close();
    });
}

// -------------------- PROCESS LOG FILES --------------------
function processLogs() {
    fs.readdir(LOG_DIR, (err, files) => {
        if (err) {
            console.error("❌ Error reading log directory:", err.message);
            return;
        }

        files.filter(f => f.endsWith(".log")).forEach(file => {
            const filePath = path.join(LOG_DIR, file);

            try {
                const content = fs.readFileSync(filePath, "utf8");
                const lines = content.split("\n").filter(line => line.trim() !== "");

                lines.forEach(line => {
                    sendToSIEM(line);
                });

                // Mark file as sent
                const sentFilePath = filePath + ".sent";
                fs.renameSync(filePath, sentFilePath);
                console.log(`✔ File marked as sent: ${sentFilePath}`);
            } catch (readErr) {
                console.error(`❌ Error reading file ${file}:`, readErr.message);
            }
        });
    });
}

// -------------------- RUN ONCE --------------------
console.log(`🚀 Sending all logs in ${LOG_DIR} to SIEM...`);
processLogs();
