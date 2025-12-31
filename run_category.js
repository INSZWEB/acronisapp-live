
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
        const settings = await prisma.settings.findUnique({
            where: { id: 1 },
        });

        // If DB has no settings or value is null → default 5 minutes
        return settings?.customerLogInterval ?? 5;
    } catch (err) {
        console.error("Error loading settings, defaulting to 5 minutes:", err.message);
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
    const url = `${creds.dcUrl}/api/alert_manager/v1/categories`;

    const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
    });

    console.log("response.data.items",response.data.items)

    return response.data.items || [];
}


async function saveCategories(categories) {
    for (const cat of categories) {
        await prisma.category.upsert({
            where: {
                name: cat.name, // UNIQUE key
            },
            update: {
                alias: cat.alias ?? null,
                disabled: cat.disabled,
            },
            create: {
                name: cat.name,
                alias: cat.alias ?? null,
                disabled: cat.disabled,
            },
        });
    }
}

// --------------------------------------------
// 7. MAIN PROCESS LOGIC
// --------------------------------------------
async function processAlerts() {
    try {
        const creds = await getCredentials();
        const token = await getAccessToken(creds);
         const categories = await fetchAlerts(creds, token);

        await saveCategories(categories);

        console.log(`✅ Synced ${categories.length} categories`);
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
