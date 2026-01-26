
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { ERROR_MESSAGES, STATUS_CODES, EMAIL_AUTH, BASE_URL_FRONTEND } = require('../constants/constants');
const axios = require("axios");
const uuid = require("uuid");
const uuidv4 = uuid.v4;

const getToken = async (clientId, clientSecret, datacenterUrl) => {

    try {
        const TOKEN_URL = `${datacenterUrl}/api/2/idp/token`;

        const response = await axios.post(
            TOKEN_URL,
            new URLSearchParams({
                grant_type: "client_credentials",
            }),
            {
                auth: {
                    username: clientId,
                    password: clientSecret,
                },
            }
        );

        return response.data.access_token;
    } catch (error) {
        console.error(
            "Token generation failed:",
            error.response?.data || error.message
        );
        throw new Error("Unable to generate access token");
    }
}



const incidentsController = {
    listall: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || ERROR_MESSAGES.DEFAULT_PAGE;
            const limit = parseInt(req.query.limit) || ERROR_MESSAGES.DEFAULT_LIMIT;
            const searchKeyword = req.query.searchKeyword || '';
            const parnterId = parseInt(req.query.parnterId);

            if (!parnterId) {
                return res.status(400).json({ error: "parnterId is required" });
            }

            // Fetch Partner
            const partner = await prisma.customer.findUnique({
                where: { id: parnterId }
            });



            if (!partner) {
                return res.status(404).json({ error: "Partner not found" });
            }

            const customerTenantId = partner.acronisCustomerTenantId;


            const skip = (page - 1) * limit;

            // Base filter (credential table)
            const whereCondition = {
                AND: [
                    { customerId: customerTenantId },
                ]
            };



            // Fetch credentials + total count
            const [totalCount, result] = await Promise.all([
                prisma.incidentLog.count({ where: whereCondition }),
                prisma.incidentLog.findMany({
                    where: whereCondition,
                    select: {
                        id: true,
                        extraId: true,
                        severity: true,
                        state: true,
                        resourceId: true,
                        agentId: true,
                        host: true,
                        receivedAt: true,

                    },
                    skip,
                    take: limit,
                    orderBy: { id: 'desc' }
                })
            ]);


            return res.status(STATUS_CODES.OK).json({
                data: result,
                pagination: {
                    totalCount,
                    totalPages: Math.ceil(totalCount / limit),
                    currentPage: page,
                    pageSize: limit
                }
            });

        } catch (error) {
            console.error(error);
            res.status(STATUS_CODES.INTERNAL_ERROR).json({
                error: ERROR_MESSAGES.INTERNAL_ERROR
            });
        }
    },
    view: async (req, res) => {
        try {
            const { id } = req.params;

            if (isNaN(parseInt(id))) {
                return res.status(400).json({ error: "Bad Request" });
            }

            const result = await prisma.incidentLog.findUnique({
                where: {
                    id: parseInt(id),
                },
                select: {
                    id: true,
                    incidentId: true,
                    extraId: true,
                    customerId: true,
                    severity: true,
                    state: true,
                    resourceId: true,
                    agentId: true,
                    host: true,
                    receivedAt: true,
                    rawPayload: true,
                },
            });

            if (!result) {
                return res.status(404).json({ error: "Incident not found" });
            }

            let extracted = {};
            if (result.rawPayload) {
                const payload = typeof result.rawPayload === 'string'
                    ? JSON.parse(result.rawPayload)
                    : result.rawPayload;

                extracted = {
                    incident_categories: payload.incident_categories || [],
                    verdict: payload.verdict || null,
                    mitigation_state: payload.mitigation_state || null,
                    detections: (payload.detections || []).map(d => ({
                        eventId: d.event_id,
                        engine: d.engine,
                        description: d.description,
                        verdict: d.verdict,
                        is_trigger: d.is_trigger,
                        file: {
                            name: d.file?.name || null
                        }
                    })),
                };
            }

            return res.status(200).json({ ...result, extracted });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    },
    update: async (req, res) => {
        console.log("🔵 [UPDATE] Request received");

        try {
            const { id } = req.params;
            const { investigationState, comment, priority } = req.body;

            console.log("1️⃣ Validating request params:", { id, investigationState });

            if (isNaN(parseInt(id))) {
                console.warn("❌ Invalid incident id:", id);
                return res.status(400).json({ error: "Bad Request" });
            }

            // 1️⃣ Get incident + customerId
            console.log("2️⃣ Fetching incident from DB...");

            const incident = await prisma.incidentLog.findUnique({
                where: { id: parseInt(id) },
                select: {
                    incidentId: true,
                    customerId: true,
                },
            });

            if (!incident) {
                console.warn("❌ Incident not found for id:", id);
                return res.status(404).json({ error: "Incident not found" });
            }

            console.log("✅ Incident found:", incident);

            // 2️⃣ Get credentials using customerId
            console.log("3️⃣ Fetching credentials for customerTenantId:", incident.customerId);

            const credential = await prisma.credential.findFirst({
                where: {
                    customerTenantId: incident.customerId,
                },
                select: {
                    customerTenantId: true,
                    clientId: true,
                    clientSecret: true,
                    datacenterUrl: true,
                },
            });

            if (!credential) {
                console.warn("❌ Credentials not found for customerTenantId:", incident.customerId);
                return res.status(404).json({ error: "Credentials not found" });
            }

            console.log("✅ Credentials found (clientId only):", {
                clientId: credential.clientId,
                datacenterUrl: credential.datacenterUrl,
            });

            const { clientId, clientSecret, datacenterUrl } = credential;

            // 3️⃣ Generate token
            console.log("4️⃣ Generating access token...");

            const token = await getToken(clientId, clientSecret, datacenterUrl);

            console.log("token", token)

            console.log("✅ Token generated successfully");

            // 4️⃣ Call external investigation state API
            console.log("5️⃣ Updating investigation state via external API...", {
                incidentId: incident.incidentId,
                investigationState,
            });

            const BASE_URL = `${datacenterUrl}/api/mdr/v1`;
            await axios.post(
                `${BASE_URL}/incidents/${incident.incidentId}/investigation_state`,
                { state: investigationState, comment, priority },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                        "Idempotency-Key": uuidv4(),
                    },
                    params: { customer_id: incident.customerId },
                }
            );

            console.log("✅ External API investigation state updated");

            // 5️⃣ Update local DB
            console.log("6️⃣ Updating local database...");

            await prisma.incidentLog.update({
                where: { id: parseInt(id) },
                data: { state: investigationState, },
            });

            console.log("✅ Local DB updated successfully");

            return res.status(200).json({
                message: "Investigation state updated successfully",
            });
        } catch (error) {
            console.error("🔥 [UPDATE ERROR]", {
                message: error.message,
                response: error.response?.data,
                stack: error.stack,
            });

            return res.status(500).json({ error: "Internal Server Error" });
        }
    },
    action: async (req, res) => {
        try {
            const { incidentId, eventId, customerId } = req.query;

            if (!incidentId || !customerId) {
                return res.status(400).json({ error: "Missing required parameters" });
            }

            const getCredential = await prisma.credential.findFirst({
                where: { customerTenantId: customerId },
                select: {
                    clientId: true,
                    clientSecret: true,
                    datacenterUrl: true,
                },
            });

            if (!getCredential) {
                return res.status(404).json({ error: "Credentials not found" });
            }

            // ---------- AUTH ----------
            const tokenRes = await axios.post(
                `${getCredential.datacenterUrl}/api/2/idp/token`,
                new URLSearchParams({ grant_type: "client_credentials" }),
                {
                    auth: {
                        username: getCredential.clientId,
                        password: getCredential.clientSecret,
                    },
                }
            );

            const token = tokenRes.data.access_token;

            // ---------- FETCH INCIDENT DETAILS ----------
            const detailsRes = await axios.get(
                `${getCredential.datacenterUrl}/api/mdr/v1/incidents/${incidentId}`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { customer_id: customerId },
                }
            );

            const details = detailsRes.data;

            const responseActions = (details.response_actions || []).filter(
                a => a.display_name && a.action && a.uri
            );

            // ✅ ALWAYS return JSON
            return res.status(200).json(responseActions);

        } catch (error) {
            console.error("Incident action error:", error.response?.data || error.message);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    },
//     executeaction: async (req, res) => {
//     console.log("▶️ Execute Action API called");

//     try {
//         // =============================
//         // 1️⃣ READ REQUEST BODY
//         // =============================
//         const { uri, action, customerId, incidentId } = req.body;
//         console.log("📥 Request body:", { uri, action, customerId, incidentId });

//         // =============================
//         // 2️⃣ FETCH CREDENTIALS
//         // =============================
//         console.log("🔐 Fetching credentials for customer:", customerId);

//         const credential = await prisma.credential.findFirst({
//             where: { customerTenantId: customerId },
//             select: {
//                 clientId: true,
//                 clientSecret: true,
//                 datacenterUrl: true,
//             },
//         });

//         if (!credential) {
//             console.error("❌ Credentials not found for customer:", customerId);
//             return res.status(404).json({ error: "Credentials not found" });
//         }

//         console.log("✅ Credentials found:", {
//             clientId: credential.clientId,
//             datacenterUrl: credential.datacenterUrl,
//         });

//         // =============================
//         // 3️⃣ AUTHENTICATION
//         // =============================
//         console.log("🔑 Requesting access token...");

//         const tokenRes = await axios.post(
//             `${credential.datacenterUrl}/api/2/idp/token`,
//             new URLSearchParams({ grant_type: "client_credentials" }),
//             {
//                 auth: {
//                     username: credential.clientId,
//                     password: credential.clientSecret,
//                 },
//             }
//         );

//         const token = tokenRes.data.access_token;
//         console.log("✅ Access token received");

//         // =============================
//         // 4️⃣ EXECUTE RESPONSE ACTION
//         // =============================
//         console.log("⚡ Executing response action:", action);
//         console.log("➡️ Action URI:", uri);

//         const idempotencyKey = uuidv4();
//         console.log("🆔 Idempotency-Key:", idempotencyKey);

//         const actionRes = await axios.post(uri, null, {
//             headers: {
//                 Authorization: `Bearer ${token}`,
//                 "Idempotency-Key": idempotencyKey,
//             },
//             params: {
//                 customer_id: customerId,
//                 comment: `Triggered from UI (${action})`,
//             },
//         });

//         const activityId = actionRes.data.activity_id;
//         console.log("✅ Action triggered successfully");
//         console.log("📌 Activity ID:", activityId);

//         // =============================
//         // 5️⃣ POLL ACTION STATUS
//         // =============================
//         let status = "PENDING";
//         let attempts = 0;

//         console.log("🔄 Polling action status...");

//         while (!["SUCCEEDED", "FAILED"].includes(status) && attempts < 10) {
//             attempts++;
//             console.log(`⏳ Poll attempt ${attempts}/10`);

//             await new Promise((r) => setTimeout(r, 5000));

//             const pollRes = await axios.get(
//                 `${credential.datacenterUrl}/api/mdr/v1/incidents/${incidentId}/response_action`,
//                 {
//                     headers: { Authorization: `Bearer ${token}` },
//                     params: {
//                         customer_id: customerId,
//                         activity_id: activityId,
//                     },
//                 }
//             );

//             status = pollRes.data.status;
//             console.log("📊 Current status:", status);
//         }

//         console.log("🏁 Final action status:", status);

//         // =============================
//         // 6️⃣ RESPONSE
//         // =============================
//         return res.status(200).json({
//             success: true,
//             action,
//             activityId,
//             status,
//         });

//     } catch (error) {
//         console.error("🔥 Execute action error:");
//         console.error(error.response?.data || error.message);

//         return res.status(500).json({ error: "Internal Server Error" });
//     }
// },
executeaction: async (req, res) => {
    console.log("▶️ Execute Action API called");

    try {
        const { uri, action, customerId, incidentId } = req.body;
        console.log("📥 Request body:", { uri, action, customerId, incidentId });

        const credential = await prisma.credential.findFirst({
            where: { customerTenantId: customerId },
            select: { clientId: true, clientSecret: true, datacenterUrl: true },
        });

        if (!credential) {
            console.error("❌ Credentials not found for customer:", customerId);
            return res.status(404).json({ error: "Credentials not found" });
        }

        console.log("✅ Credentials found:", {
            clientId: credential.clientId,
            datacenterUrl: credential.datacenterUrl,
        });

        const tokenRes = await axios.post(
            `${credential.datacenterUrl}/api/2/idp/token`,
            new URLSearchParams({ grant_type: "client_credentials" }),
            {
                auth: { username: credential.clientId, password: credential.clientSecret },
            }
        );

        const token = tokenRes.data.access_token;
        console.log("✅ Access token received");

        const idempotencyKey = uuidv4();
        console.log("🆔 Idempotency-Key:", idempotencyKey);

        const actionRes = await axios.post(uri, null, {
            headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": idempotencyKey },
            params: { customer_id: customerId, comment: `Triggered from UI (${action})` },
        });

        const activityId = actionRes.data.activity_id;
        console.log("✅ Action triggered successfully");
        console.log("📌 Activity ID:", activityId);

        // Return immediately with QUEUED status
        return res.status(200).json({
            success: true,
            action,
            activityId,
            status: "QUEUED",
        });

    } catch (error) {
        console.error("🔥 Execute action error:", error.response?.data || error.message);
        return res.status(500).json({ error: "Internal Server Error" });
    }
},
getActionStatus: async (req, res) => {
    try {
        const { customerId, incidentId, activityId } = req.query;

        const credential = await prisma.credential.findFirst({
            where: { customerTenantId: customerId },
        });

        if (!credential) return res.status(404).json({ error: "Credentials not found" });

        const tokenRes = await axios.post(
            `${credential.datacenterUrl}/api/2/idp/token`,
            new URLSearchParams({ grant_type: "client_credentials" }),
            {
                auth: { username: credential.clientId, password: credential.clientSecret },
            }
        );

        const token = tokenRes.data.access_token;

        const pollRes = await axios.get(
            `${credential.datacenterUrl}/api/mdr/v1/incidents/${incidentId}/response_action`,
            {
                headers: { Authorization: `Bearer ${token}` },
                params: { customer_id: customerId, activity_id: activityId },
            }
        );

        return res.json({ success: true, status: pollRes.data.status });
    } catch (err) {
        console.error("🔥 Status poll error:", err.response?.data || err.message);
        return res.status(500).json({ error: "Failed to fetch status" });
    }
}



};

module.exports = incidentsController;
