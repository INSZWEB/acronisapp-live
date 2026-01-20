const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const fs = require("fs");
const path = require("path");

const PREFERRED_ROOT = "/var/log/acronis_edr";
const LOCAL_UPLOADS = path.join(__dirname, "uploads");

// =========================================
// UTILS
// =========================================
function getLast7DaysRange() {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    return {
        from: start.toISOString(),
        to: end.toISOString(),
    };
}

// --------------------------------------------
// GET INTERVAL FROM SETTINGS TABLE
// --------------------------------------------
async function getFetchInterval() {
    try {
        const settings = await prisma.settings.findFirst({
            orderBy: { id: "desc" }, // always latest row
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

// =========================================
// 1. LOAD CREDENTIALS FROM DATABASE
// =========================================
async function getCredentials() {
    return prisma.credential.findMany({
        where: { active: true },
    });
}

// =========================================
// AUTH
// =========================================
async function getToken(cred) {
    const tokenUrl = `${cred.datacenterUrl}/api/2/idp/token`;

    const res = await axios.post(
        tokenUrl,
        new URLSearchParams({ grant_type: "client_credentials" }),
        {
            auth: {
                username: cred.clientId,
                password: cred.clientSecret,
            },
        }
    );

    return res.data.access_token;
}

// =========================================
// API CALLS
// =========================================
async function fetchIncidents(token, baseUrl) {
    const { from, to } = getLast7DaysRange();

    const res = await axios.get(`${baseUrl}/incidents`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        params: {
            created_at: `range(${from},${to})`,
        },
    });

    return res.data.items || [];
}

async function fetchIncidentDetails(token, baseUrl, incidentId, customerId) {
    const res = await axios.get(
        `${baseUrl}/incidents/${incidentId}`,
        {
            headers: { Authorization: `Bearer ${token}` },
            params: { customer_id: customerId },
        }
    );

    return res.data;
}

async function fetchResourceDetails(token, resourceBaseUrl, resourceId) {
    const res = await axios.get(
        `${resourceBaseUrl}/${resourceId}`,
        {
            headers: { Authorization: `Bearer ${token}` },
        }
    );

    return res.data;
}

// =========================================
// DB CHECKS
// =========================================
async function isAgentExists(agentId) {
    return !!(await prisma.device.findFirst({
        where: { agentId },
        select: { id: true },
    }));
}

async function isIncidentExists(incidentId) {
    return !!(await prisma.incidentLog.findUnique({
        where: { incidentId },
        select: { id: true },
    }));
}

function convertToCEF(incident, details, resource, extraId, customerName) {
    const cefVersion = "CEF:0";
    const deviceVendor = "Acronis";
    const deviceProduct = "EDR";
    const deviceVersion = "1.0";

    const signature = incident.incident_id;
    const name =
        incident.title ||
        details?.title ||
        details?.type ||
        "Security Incident";

    // Map severity to numeric CEF (recommended)
    const severityMap = {
        low: 3,
        medium: 5,
        high: 8,
        critical: 10,
    };
    const cefSeverity =
        severityMap[String(incident.severity).toLowerCase()] ?? 5;

    // 🔥 FULL DETAILS OBJECT
    const fullDetails = {
        incident,
        incidentDetails: details,
        resource,
        customer: customerName,
        extraId,
        fetchedAt: new Date().toISOString(),
    };

    // Convert to safe single-line string
    const msg = JSON.stringify(fullDetails)
        .replace(/\n/g, " ")
        .replace(/\|/g, "\\|")
        .replace(/=/g, "\\=");

    const extension = [
        `rt=${Date.now()}`,
        `cs1Label=Customer`,
        `cs1=${customerName}`,
        `cs2Label=ExtraId`,
        `cs2=${extraId}`,
        `cs3Label=IncidentId`,
        `cs3=${incident.incident_id}`,
        `cs4Label=ResourceId`,
        `cs4=${incident.resource_id}`,
        `cs5Label=AgentId`,
        `cs5=${resource?.agent_id || "-"}`,
        `src=${incident.host_name || "unknown"}`,
        `msg=${msg}`,
    ].join(" ");

    return `${cefVersion}|${deviceVendor}|${deviceProduct}|${deviceVersion}|${signature}|${name}|${cefSeverity}|${extension}`;
}
function isAlertInFile(filePath, alertId) {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, "utf8");
    return content.includes(alertId);
}

function writeAlertToLog(cefMsg, alertId, customerName) {
    const safeName = customerName.replace(/\./g, "_").replace(/\s+/g, "_");

    let baseDir = PREFERRED_ROOT;
    try {
        fs.mkdirSync(baseDir, { recursive: true });
    } catch {
        baseDir = LOCAL_UPLOADS;
        fs.mkdirSync(baseDir, { recursive: true });
    }

    const filePath = path.join(baseDir, `${safeName}.log`);

    if (isAlertInFile(filePath, alertId)) {
        console.log(`⚠ Alert ${alertId} already logged in file`);
        return;
    }

    fs.appendFileSync(filePath, cefMsg + "\n", "utf8");
    console.log(`✔ CEF written → ${filePath}`);
}
async function getAndIncrementExtraIdCounter() {
    return prisma.$transaction(async (tx) => {
        const settings = await tx.settings.findFirst({
            orderBy: { id: "desc" },
            select: { id: true, extraIdGenerate: true },
        });

        if (!settings) throw new Error("Settings table is empty");

        const currentValue = settings.extraIdGenerate ?? 1;

        await tx.settings.update({
            where: { id: settings.id },
            data: { extraIdGenerate: currentValue + 1 },
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
        .padEnd(4, "X");

    const numberPart = String(counter).padStart(8, "0");
    return `${prefix}${customerCode}${numberPart}`;
}

// =========================================
// MAIN
// =========================================
async function main() {
    try {
        const credentials = await getCredentials();
        if (!credentials.length) {
            console.log("⚠ No active credentials found.");
            return;
        }

        for (const cred of credentials) {
            console.log(`\n===== CUSTOMER ${cred.customerTenantId} =====`);

            const BASE_URL = `${cred.datacenterUrl}/api/mdr/v1`;
            const RESOURCE_BASE_URL = `${cred.datacenterUrl}/api/resource_management/v4/resources`;

            try {
                // 1️⃣ Token per credential
                const token = await getToken(cred);

                // 2️⃣ Fetch incidents
                const incidents = await fetchIncidents(token, BASE_URL);

                if (!incidents.length) {
                    console.log("⚠ No incidents found.");
                    continue;
                }

                for (const incident of incidents) {
                    if (!incident.resource_id) continue;

                    // ---- INCIDENT EXISTS CHECK ----
                    if (await isIncidentExists(incident.incident_id)) {
                        console.log("⏭ Incident already exists, skipping");
                        continue;
                    }

                    let details, resource;

                    try {
                        details = await fetchIncidentDetails(
                            token,
                            BASE_URL,
                            incident.incident_id,
                            incident.customer_id
                        );

                        resource = await fetchResourceDetails(
                            token,
                            RESOURCE_BASE_URL,
                            incident.resource_id
                        );
                    } catch {
                        continue;
                    }

                    if (!(await isAgentExists(resource.agent_id))) continue;

                    // ---- INSERT INCIDENT ----
                    const counter = await getAndIncrementExtraIdCounter();
                    const extraId = generateExtraId(cred.customerTenantId, counter);

                    // Convert to CEF
                    const cefMsg = convertToCEF(
                        incident,
                        details,
                        resource,
                        extraId,
                        cred.customerTenantId
                    );

                    // Write to log file
                    writeAlertToLog(
                        cefMsg,
                        incident.incident_id,
                        cred.customerTenantId
                    );

                    // Save to DB (WITH extraId)
                    await prisma.incidentLog.create({
                        data: {
                            incidentId: incident.incident_id,
                            extraId: extraId,                 // ✅ NEW
                            customerId: incident.customer_id,
                            severity: incident.severity,
                            state: incident.state,
                            resourceId: incident.resource_id,
                            agentId: resource.agent_id,
                            host: incident.host_name,
                            receivedAt: incident.created_at
                                ? new Date(incident.created_at)
                                : new Date(),
                            rawPayload: details,
                        },
                    });

                    console.log(`✅ Incident saved (${extraId})`);


                    console.log("✅ New Incident added:", incident.incident_id);
                }

                console.log("✔ Customer processed successfully");

            } catch (err) {
                console.error(
                    `❌ Error for customer ${cred.customerTenantId}:`,
                    err.response?.data || err.message
                );
            }
        }

        console.log("\n🎉 ALL CUSTOMERS PROCESSED");
    } catch (err) {
        console.error("❌ Fatal error:", err.message);
    }
}

// --------------------------------------------
// START LOOP
// --------------------------------------------
(async () => {
    try {
        const interval = await getFetchInterval();

        console.log(
            `🚀 Acronis EDR connector running every ${interval} minutes...`
        );

        // ▶ Run immediately
        await main();

        // ▶ Run on interval
        setInterval(async () => {
            try {
                const newInterval = await getFetchInterval();
                console.log(`⏱ Running connector (interval: ${newInterval} minutes)`);

                await main();
            } catch (err) {
                console.error("❌ Interval execution failed:", err.message);
            }
        }, interval * 60 * 1000);

    } catch (err) {
        console.error("❌ Failed to start connector:", err.message);
    }
})();
