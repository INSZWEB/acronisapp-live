const prisma = require("../../prismaClient");
const { v4: uuidv4 } = require("uuid");

const getApiIntegration = async (req, res) => {
    const { tenant_id, request_id, context, payload } = req.body;

    // Generate response_id
    const response_id = uuidv4();

    if (!request_id) {
        return res.status(400).json({ response_id, message: "request_id missing" });
    }

    const partnerTenantId = context?.tenant_id;
    const clientId = payload?.client_id;
    const clientSecret = payload?.secret_key;
    const datacenterUrl = payload?.data_center_url;

    if (!partnerTenantId || !clientId || !clientSecret || !datacenterUrl) {
        return res.status(400).json({ response_id, message: "Missing required fields in payload/context" });
    }

    // IMPORTANT: Declare existing here
    let existing = null;

    try {
        // Check if credential exists
        existing = await prisma.credential.findFirst({
            where: { clientId }
        });

        // If not exists → create
        if (!existing) {
            await prisma.credential.create({
                data: {
                    partnerTenantId,
                    clientId,
                    clientSecret,
                    datacenterUrl
                }
            });
        }

    } catch (err) {
        return res.status(500).json({ response_id, message: `Database error: ${err.message}` });
    }

    return res.json({
        type: "cti.a.p.acgw.response.v1.0~insightz_technology_pte_ltd.insightz_technology.api_integration_api_success.v1.64",
        request_id,
        response_id,
        payload: {
            result: "success",
            message: existing
                ? "Credential already exists, skipped update"
                : "API integration completed successfully"
        },
    });
};
  
module.exports = {
    getApiIntegration,
};
