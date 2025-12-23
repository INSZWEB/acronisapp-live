const prisma = require("../../prismaClient");
const { v4: uuidv4 } = require("uuid");

const getApiIntegration = async (req, res) => {
    const { request_id, context, payload } = req.body;

    const response_id = uuidv4();

    if (!request_id) {
        return res.status(400).json({
            response_id,
            message: "request_id missing"
        });
    }

    const partnerTenantId = context?.tenant_id;
    const clientId = payload?.client_id;
    const clientSecret = payload?.secret_key;
    const datacenterUrl = payload?.data_center_url;

    if (!partnerTenantId || !clientId || !clientSecret || !datacenterUrl) {
        return res.status(400).json({
            response_id,
            message: "Missing required fields in payload/context"
        });
    }

    let existingCredential;

    try {
        existingCredential = await prisma.credential.findFirst({
            where: { clientId }
        });

        // ❌ Already exists → ERROR response
        if (existingCredential) {
            return res.json({
                type: "cti.a.p.acgw.response.v1.0~insightz_technology_pte_ltd.insightz_technology.api_integration_api_error.v1.67",
                request_id,
                response_id,
                payload: {
                    result: "error",
                    message: "Credential already exists"
                }
            });
        }

        // ✅ Create new credential
        await prisma.credential.create({
            data: {
                partnerTenantId,
                clientId,
                clientSecret,
                datacenterUrl
            }
        });

        // ✅ Success response
        return res.json({
            type: "cti.a.p.acgw.response.v1.0~insightz_technology_pte_ltd.insightz_technology.api_integration_api_success.v1.67",
            request_id,
            response_id,
            payload: {
                "result": "success",
                "message": "API integration completed successfully",
                "client_id": "",
                "secret_key": "",
                "data_center_url": ""
            }
        });

    } catch (err) {
        return res.status(500).json({
            type: "cti.a.p.acgw.response.v1.0~insightz_technology_pte_ltd.insightz_technology.api_integration_api_error.v1.67",
            request_id,
            response_id,
            payload: {
                result: "error",
                message: `Database error: ${err.message}`
            }
        });
    }
};

module.exports = {
    getApiIntegration
};
