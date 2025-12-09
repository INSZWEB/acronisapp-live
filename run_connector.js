// run_connector.js
const axios = require("axios");
const base64 = require("base-64");
const fs = require("fs");
const path = require("path");

// --------------------------------------------
// 1. CONFIG
// --------------------------------------------
const CLIENT_ID = "20224571-f106-4a1e-a2a6-a283ec427b55";
const CLIENT_SECRET = "iurf4nmtpdejz4gwjyviqpifq4cciak7u3pttpdk775ix42kfq4u";
const DC_URL = "https://eu8-cloud.acronis.com";

const PREFERRED_ROOT = "/var/log/acronis_edr";
const LOCAL_UPLOADS = path.join(__dirname, "uploads");
const FETCH_INTERVAL_MINUTES = 5;
const MAX_RUNS = 5; // Run 5 times

let runCount = 0;

// --------------------------------------------
// 2. GET ACCESS TOKEN
// --------------------------------------------
async function getAccessToken() {
    const tokenUrl = `${DC_URL}/bc/idp/token`;
    const creds = base64.encode(`${CLIENT_ID}:${CLIENT_SECRET}`);
    const headers = {
        "Authorization": `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
    };
    const data = new URLSearchParams({ grant_type: "client_credentials" }).toString();

    const response = await axios.post(tokenUrl, data, { headers });
    return response.data.access_token;
}

// --------------------------------------------
// 3. FETCH ALERTS
// --------------------------------------------
async function fetchAlerts(accessToken) {
    const url = `${DC_URL}/api/alert_manager/v1/alerts`;
    const headers = { Authorization: `Bearer ${accessToken}` };
    const params = { severity: "or(warning,critical)" };

    const response = await axios.get(url, { headers, params });
    return response.data.items || [];
}

// --------------------------------------------
// 4. CONVERT ALERT TO CEF
// --------------------------------------------
function convertToCEF(alert) {
    const d = alert.details || {};
    const severityMap = { info: 3, warning: 6, critical: 9, error: 8 };
    const cefSeverity = severityMap[(alert.severity || "").toLowerCase()] || 5;

    const customerName = d.customerName || "UnknownCustomer";

    const extension = {
        cs1Label: "customerName",
        cs1: customerName,
        cs2Label: "rawEvent",
        cs2: JSON.stringify(alert),
        deviceCustomString1Label: "resourceId",
        deviceCustomString1: d.resourceId || "",
        end: d.detectionTime || "",
    };

    const escapeCEF = (v) =>
        (v !== undefined && v !== null ? String(v) : "")
            .replace(/\\/g, "\\\\")
            .replace(/\|/g, "\\|")
            .replace(/=/g, "\\=");

    const extensionStr = Object.entries(extension)
        .map(([k, v]) => `${k}=${escapeCEF(v)}`)
        .join(" ");

    return [
        "CEF:0",
        "Acronis",
        "Cyber Protect",
        "1.0",
        alert.id || "",
        d.incidentTrigger || "AcronisAlert",
        cefSeverity,
        extensionStr,
    ].join("|");
}

// --------------------------------------------
// 5. WRITE ALERT TO LOG
// --------------------------------------------
function writeAlertToLog(alert, customerName) {
    const cefMsg = convertToCEF(alert);
    const safeName = customerName.replace(/\./g, "_").replace(/\s+/g, "_");

    let basePath;
    try {
        fs.mkdirSync(PREFERRED_ROOT, { recursive: true });
        basePath = PREFERRED_ROOT;
    } catch {
        basePath = LOCAL_UPLOADS;
        fs.mkdirSync(basePath, { recursive: true });
    }

    const filename = path.join(basePath, `${safeName}.log`);

    // Check for duplicate alert ID
    let alreadyLogged = false;
    if (fs.existsSync(filename)) {
        const fileContent = fs.readFileSync(filename, "utf8");
        alreadyLogged = fileContent.includes(alert.id);
    }

    if (!alreadyLogged) {
        fs.appendFileSync(filename, cefMsg + "\n", "utf8");
        console.log(`✔ Saved alert ${alert.id} → ${filename}`);
    } else {
        console.log(`⚠ Alert ${alert.id} already logged. Skipping.`);
    }
}


// --------------------------------------------
// 6. PROCESS ALERTS
// --------------------------------------------
async function processAlerts() {
    runCount++;
    console.log(`\n[Run ${runCount}] ${new Date().toISOString()} - Processing alerts...`);

    try {
        const token = await getAccessToken();
        const alerts = await fetchAlerts(token);

        console.log(`Fetched ${alerts.length} alerts.`);
        alerts.forEach((alert) => {
            const customerName = (alert.details && alert.details.customerName) || "UnknownCustomer";
            writeAlertToLog(alert, customerName);
        });

        console.log(`✔ Run ${runCount} completed.`);
    } catch (err) {
        console.error("Error processing alerts:", err.message);
    }

    if (runCount >= MAX_RUNS) {
        console.log(`\nReached maximum of ${MAX_RUNS} runs. Stopping connector.`);
        clearInterval(interval);
    }
}

// --------------------------------------------
// 7. START AUTOMATIC LOOP
// --------------------------------------------
console.log(`Starting Acronis EDR connector, will run every ${FETCH_INTERVAL_MINUTES} minutes, up to ${MAX_RUNS} times...`);
processAlerts(); // Run immediately

const interval = setInterval(processAlerts, FETCH_INTERVAL_MINUTES * 60 * 1000);
