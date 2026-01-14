const axios = require("axios");
const prisma = require("../../prismaClient");
const { v4: uuidv4 } = require("uuid");
const { sendMail } = require("../../utils/sendMail");
const { newPartnerSalesTemplate } = require("../../templates/newCustomerTemplate");

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

    /* ✅ Send email ONLY for NEW partner integration */
    await sendMail({
      to: "Pradeep.Rajangam@insightz.tech",

      subject: "🤝 New Partner API Integrated",
      html: newPartnerSalesTemplate({
        partnerTenantId,
        datacenterUrl,
        clientId,
        integrationDate: new Date().toISOString(),
      }),
    });

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
    console.error("Partner API integration error:", err);
    return res.status(500).json({
      request_id,
      response_id,
      payload: {
        result: "error",
        message: "Internal server error",
      },
    });
  }
};

module.exports = {
  getParnterApiIntegration,
};
