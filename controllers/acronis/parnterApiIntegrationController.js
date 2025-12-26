const axios = require("axios");
const prisma = require("../../prismaClient");
const { v4: uuidv4 } = require("uuid");

// -------------------------------------------
// ACRONIS API HELPERS
// -------------------------------------------
async function getToken(cred) {
    const url = `${cred.datacenterUrl}/api/2/idp/token`;

    const res = await axios.post(
        url,
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

async function apiGet(url, token, params = {}) {
    const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params,
    });
    return res.data;
}

// -------------------------------------------
// API Integration Handler
// -------------------------------------------
const getParnterApiIntegration = async (req, res) => {
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

    try {
        // Check if credential already exists
        let existingCredential = await prisma.parnterCredential.findFirst({ where: { clientId } });

        if (!existingCredential) {
            // Create new credential if it doesn't exist
            existingCredential = await prisma.parnterCredential.create({
                data: { partnerTenantId, clientId, clientSecret, datacenterUrl }
            });
        }

        // Get token using credential
        const token = await getToken(existingCredential);

        // Fetch all contact IDs for this partner tenant
        const contactsResponse = await apiGet(`${datacenterUrl}/api/2/tenants/${partnerTenantId}/contacts`, token);

        if (!contactsResponse?.items || contactsResponse.items.length === 0) {
            console.log("No contacts found for tenant:", partnerTenantId);
        } else {
            for (const contactId of contactsResponse.items) {
                const contactDetails = await apiGet(`${datacenterUrl}/api/2/contacts/${contactId}`, token);
                console.log("Contact Details:", contactDetails);
            }
        }

        // Respond success
        return res.json({
            type: "cti.a.p.acgw.response.v1.0~insightz_technology_pte_ltd.insightz_technology.partner_api_integration_partner_api_success.v1.88",
            request_id,
            response_id,
            payload: {
                "result": "success",
                "sucess_message": "API integration completed successfully",
                "client_id": "",
                "secret_key": "",
                "data_center_url": "",
            }
        });

    } catch (err) {
        return res.status(500).json({
            type: "cti.a.p.acgw.response.v1.0~insightz_technology_pte_ltd.insightz_technology.partner_api_integration_partner_api_success.v1.88",
            request_id,
            response_id,
            payload: {
                result: "error",
                message: `Error: ${err.message}`
            }
        });
    }
};

module.exports = {
    getParnterApiIntegration
};
