// run_connector.js
const axios = require("axios");
const base64 = require("base-64");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// --------------------------------------------
// CONFIG
// --------------------------------------------
const PREFERRED_ROOT = "/var/log/acronis_edr";
const LOCAL_UPLOADS = path.join(__dirname, "uploads");
// --------------------------------------------
// GET INTERVAL FROM SETTINGS TABLE
// --------------------------------------------
async function getFetchInterval() {
    try {
        const settings = await prisma.settings.findFirst({
            orderBy: { id: "desc" } // always latest row
        });

        return settings?.customerLogInterval ?? 5;
    } catch (err) {
        console.error(
            "Error loading settings, defaulting to 5 minutes:",
            err.message
        );
        return 5;
    }
}


// --------------------------------------------
// 1. LOAD CREDENTIALS FROM DATABASE
// --------------------------------------------
async function getCredentials() {
    const cred = await prisma.credential.findFirst({
        where: { active: true }
    });

    if (!cred) throw new Error("No active credentials found in DB");

    return {
        clientId: cred.clientId,
        clientSecret: cred.clientSecret,
        dcUrl: cred.datacenterUrl,
        partnerTenantId: cred.partnerTenantId,
        customerTenantId: cred.customerTenantId
    };
}

// --------------------------------------------
// 2. GET ACCESS TOKEN
// --------------------------------------------
async function getAccessToken(creds) {
    const url = `${creds.dcUrl}/bc/idp/token`;
    const auth = base64.encode(`${creds.clientId}:${creds.clientSecret}`);

    const response = await axios.post(
        url,
        new URLSearchParams({ grant_type: "client_credentials" }).toString(),
        {
            headers: {
                "Authorization": `Basic ${auth}`,
                "Content-Type": "application/x-www-form-urlencoded"
            }
        }
    );

    return response.data.access_token;
}

// --------------------------------------------
// 3. FETCH ALERTS
// --------------------------------------------
async function fetchAlerts(creds, token) {
    const url = `${creds.dcUrl}/api/alert_manager/v1/alerts`;

    //console.log("token",token)
    const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { severity: "or(warning,critical)" }
    });

    return response.data.items || [];
}

// --------------------------------------------
// 4. CONVERT ALERT TO CEF
// --------------------------------------------
function convertToCEF(alert) {
    const d = alert.details || {};
    const severityMap = { info: 3, warning: 6, critical: 9, error: 8 };
    const cefSeverity = severityMap[(alert.severity || "").toLowerCase()] || 5;

    const extension = {
        cs1Label: "customerName",
        cs1: d.customerName || "UnknownCustomer",
        cs2Label: "rawEvent",
        cs2: JSON.stringify(alert),
        deviceCustomString1Label: "resourceId",
        deviceCustomString1: d.resourceId || "",
        end: d.detectionTime || ""
    };

    const escapeCEF = (v) =>
        String(v || "")
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
        extensionStr
    ].join("|");
}

// --------------------------------------------
// 5A. CHECK IF ALERT ALREADY IN FILE
// --------------------------------------------
function isAlertInFile(filePath, alertId) {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, "utf8");
    return content.includes(alertId);
}

// --------------------------------------------
// 5B. WRITE ALERT TO LOG FILE CLEANLY
// --------------------------------------------
function writeAlertToLog(alert, customerName) {
    const cefMsg = convertToCEF(alert);
    const safeName = customerName.replace(/\./g, "_").replace(/\s+/g, "_");

    let baseDir = PREFERRED_ROOT;
    try {
        fs.mkdirSync(baseDir, { recursive: true });
    } catch {
        baseDir = LOCAL_UPLOADS;
        fs.mkdirSync(baseDir, { recursive: true });
    }

    const filePath = path.join(baseDir, `${safeName}.log`);

    // Skip if already logged
    if (isAlertInFile(filePath, alert.id)) {
        console.log(`⚠ Alert ${alert.id} already logged in file.`);
        return;
    }

    fs.appendFileSync(filePath, cefMsg + "\n", "utf8");
    console.log(`✔ Saved alert ${alert.id} → ${filePath}`);
}

// --------------------------------------------
// 6. DB FUNCTIONS
// --------------------------------------------
async function isAlertAlreadySaved(alertId) {
    const row = await prisma.alertLog.findFirst({ where: { alertId } });
    return !!row;
}

async function getAndIncrementExtraIdCounter() {
    return await prisma.$transaction(async (tx) => {
        const settings = await tx.settings.findFirst({
            orderBy: { id: "desc" },
            select: { id: true, extraIdGenerate: true }
        });

        if (!settings) {
            throw new Error("Settings table is empty");
        }

        const currentValue = settings.extraIdGenerate ?? 1;

        await tx.settings.update({
            where: { id: settings.id },
            data: {
                extraIdGenerate: currentValue + 1
            }
        });

        return currentValue;
    });
}


function generateExtraId(customerName, counter) {
    const prefix = "ALT";

    const customerCode = customerName
        .replace(/\s+/g, "")
        .substring(0, 4)
        .toUpperCase()
        .padEnd(4, "X"); // ensure 4 chars

    const numberPart = String(counter).padStart(8, "0");

    return `${prefix}${customerCode}${numberPart}`;
}


async function saveAlertToDB(alert, creds) {
    const customerName = alert.details?.customerName || "Unknown";

    // 1️⃣ Get global counter & increment settings
    const counter = await getAndIncrementExtraIdCounter();

    // 2️⃣ Generate extraId (15 chars)
    const extraId = generateExtraId(customerName, counter);

    // 3️⃣ Save alert
    await prisma.alertLog.create({
        data: {
            alertId: alert.id,
            extraId,
            customerName,
            partnerTenantId: creds.partnerTenantId,
            customerTenantId: creds.customerTenantId,
            receivedAt: alert.receivedAt,
            rawJson: alert
        }
    });

    console.log(`🆔 ExtraId created: ${extraId}`);
}


// --------------------------------------------
// 7. MAIN PROCESS LOGIC
// --------------------------------------------
async function processAlerts() {
    try {
        const creds = await getCredentials();
        const token = await getAccessToken(creds);
        const alerts = await fetchAlerts(creds, token);

        console.log(`Fetched ${alerts.length} alerts.`);

        for (const alert of alerts) {
            const customerName = alert.details?.customerName || "UnknownCustomer";
            const safeName = customerName.replace(/\./g, "_").replace(/\s+/g, "_");
            const filePath = path.join(PREFERRED_ROOT, `${safeName}.log`);

            // 1. DB duplicate check
            if (await isAlertAlreadySaved(alert.id)) {
                console.log(`⚠ Alert ${alert.id} already exists in DB.`);
                continue;
            }

            // 2. File duplicate check
            if (isAlertInFile(filePath, alert.id)) {
                console.log(`⚠ Alert ${alert.id} already exists in log file.`);
                continue;
            }

            // 3. Save log file
            writeAlertToLog(alert, customerName);

            // 4. Save to DB
            await saveAlertToDB(alert, creds);

            console.log(`✔ Alert ${alert.id} saved → file & DB`);
        }
    } catch (err) {
        console.error("❌ Error:", err.message);
    }
}

// --------------------------------------------
// 8. START LOOP
// --------------------------------------------
(async () => {
    const interval = await getFetchInterval();

    console.log(`Acronis EDR connector running every ${interval} minutes...`);

    // Run immediately
    processAlerts();

    // Run on interval from DB
    setInterval(async () => {
        const newInterval = await getFetchInterval(); // Re-read in case settings changed
        console.log(`Updated interval: ${newInterval} minutes`);
        processAlerts();
    }, interval * 60 * 1000);
})();
