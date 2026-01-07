const axios = require("axios");
const prisma = require("../../prismaClient");
const { v4: uuidv4 } = require("uuid");

// -------------------------------------------
// API Integration Handler
// -------------------------------------------
const getParnterApiIntegration = async (req, res) => {
  const { request_id, context, payload } = req.body;
  const response_id = uuidv4();

  if (!request_id) {
    return res.status(400).json({
      response_id,
      message: "request_id missing",
    });
  }

  const partnerTenantId = context?.tenant_id;
  const clientId = payload?.client_id;
  const clientSecret = payload?.secret_key;
  const datacenterUrl = context?.datacenter_url;

  if (!partnerTenantId || !clientId || !clientSecret || !datacenterUrl) {
    return res.status(400).json({
      response_id,
      message: "Missing required fields in payload/context",
    });
  }

  try {
    // ✅ Check if credential already exists
    const existingCredential = await prisma.parnterCredential.findFirst({
      where: { clientId },
    });

    if (existingCredential) {
      // ✅ Already exists → return success message
      return res.json({
        type: "cti.a.p.acgw.response.v1.0~insightz_technology_pte_ltd.insightz_technology.partner_api_integration_partner_api_success.v1.96",
        request_id,
        response_id,
        payload: {
          result: "success",
          message: "API integration already existing",
          client_id: "",
          secret_key: "",
          data_center_url: "",
        },
      });
    }

    // ✅ Create new credential
    await prisma.parnterCredential.create({
      data: {
        partnerTenantId,
        clientId,
        clientSecret,
        datacenterUrl,
      },
    });

    // ✅ New success response
    return res.json({
      type: "cti.a.p.acgw.response.v1.0~insightz_technology_pte_ltd.insightz_technology.partner_api_integration_partner_api_success.v1.96",
      request_id,
      response_id,
      payload: {
        result: "success",
        message: "API integration completed successfully",
        client_id: "",
        secret_key: "",
        data_center_url: "",
      },
    });
  } catch (err) {
    console.log("error", err.message);
    return res.status(500).json({
      request_id,
      response_id,
      payload: {
        result: "error",
        message: err.message,
      },
    });
  }
};

module.exports = {
  getParnterApiIntegration,
};
