const prisma = require("../../prismaClient");
const { v4: uuidv4 } = require("uuid");
const { sendMail } = require("../../utils/sendMail");
const { newPartnerSalesTemplate } = require("../../templates/newCustomerTemplate");

/* ----------------- Helpers ----------------- */
function parseDDMMYYYY(dateStr) {
    if (!dateStr) return null;
    const [day, month, year] = dateStr.split(".").map(Number);
    if (!day || !month || !year) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    return isNaN(date.getTime()) ? null : date;
}

/* =========================================================
   PARTNER MIRRORING : ENABLE
========================================================= */
const enable = async (req, res) => {
  const { request_id, context, payload } = req.body;
  const extra = req.cyberAppExtra;
  const response_id = uuidv4();

  const tenant_id = req.body?.tenant_id || context?.tenant_id;
  if (!tenant_id) {
    return res.status(400).json({
      response_id,
      message: "tenant_id missing in callback context",
    });
  }

  const tenantName =
    payload?.acronis_tenant_name ||
    payload?.tenant_name ||
    context?.acronis_tenant_name ||
    context?.tenant_name ||
    null;

  const contactName = extra?.["Enter the name"] || null;
  const contactEmail = extra?.["Enter the email"] || null;
  const preferredSlot = extra?.["Time slot"] || null;
  const timeZone = extra?.["Time Zone"] || null;
  const preferredDate = parseDDMMYYYY(extra?.["enter the date"]);

  const existing = await prisma.partner.findUnique({
    where: { tenantId: tenant_id },
  });

  let entry;
  let isFirstEnable = false;

  if (!existing) {
    // Rare edge case (get_state not called)
    isFirstEnable = true;

    entry = await prisma.partner.create({
      data: {
        tenantId: tenant_id,
        tenantName,
        currentState: "ENABLED",
        enabledAt: new Date(),
        emailSent: false,
        contactName,
        contactEmail,
        PreferredSlot: preferredSlot,
        TimeZone: timeZone,
        preferredDate,
      },
    });
  } else {
    // ✅ THIS IS THE REAL CHECK
    if (!existing.enabledAt) {
      isFirstEnable = true;
    }

    entry = await prisma.partner.update({
      where: { id: existing.id },
      data: {
        tenantName,
        currentState: "ENABLED",
        enabledAt: existing.enabledAt ?? new Date(),
        contactName,
        contactEmail,
        PreferredSlot: preferredSlot,
        TimeZone: timeZone,
        preferredDate,
      },
    });
  }

  // ✅ Enable credentials
  await prisma.parnterCredential.updateMany({
    where: { partnerTenantId: tenant_id },
    data: { active: true },
  });

  /* =====================================================
     📧 SEND EMAIL ONLY ON FIRST ENABLE
  ===================================================== */
  if (isFirstEnable && !entry.emailSent) {
    try {
      await sendMail({
        to: "Pradeep.Rajangam@insightz.tech",
        subject: "🤝 New Partner API Integrated",
        html: newPartnerSalesTemplate({
          partnerTenantId: tenant_id,
          partnerName: tenantName,
          contactName,
          contactEmail,
          preferredDate,
          preferredSlot,
          timeZone,
          integrationDate: new Date().toISOString(),
        }),
      });

      await prisma.partner.update({
        where: { id: entry.id },
        data: { emailSent: true },
      });
    } catch (err) {
      console.error("Partner email failed:", err.message);
      // ❗ Never block callback
    }
  }

  return res.json({
    type: "cti.a.p.acgw.response.v1.1~a.p.partner.mirroring.enable.ok.v1.0",
    request_id,
    response_id,
    payload: {
      state: "ENABLED",
      vendor_tenant_id: String(entry.id),
      acronis_tenant_id: entry.tenantId,
    },
  });
};



/* =========================================================
   PARTNER MIRRORING : GET STATE
========================================================= */
const getState = async (req, res) => {
    const { request_id } = req.body;
    const tenant_id = req.body?.tenant_id || req.body?.context?.tenant_id;
    const response_id = uuidv4();

    if (!tenant_id) {
        return res.status(400).json({
            response_id,
            message: "tenant_id missing",
        });
    }

    const entry = await prisma.partner.findFirst({
        where: { tenantId: tenant_id },
        orderBy: { id: "desc" },
    });

    let state = "DISABLED";

    if (entry) {
        state = entry.currentState?.toUpperCase() || "DISABLED";
        await prisma.partner.updateMany({
            where: { tenantId: tenant_id },
            data: { currentState: state },
        });
    } else {
        await prisma.partner.create({
            data: {
                tenantId: tenant_id,
                requestId: request_id,
                responseId: response_id,
                currentState: "DISABLED",
            },
        });
    }

    // ✅ Sync credential state
    await prisma.parnterCredential.updateMany({
        where: { partnerTenantId: tenant_id },
        data: { active: state === "ENABLED" },
    });

    return res.json({
        type: "cti.a.p.acgw.response.v1.1~a.p.partner.mirroring.get_state.ok.v1.0",
        request_id,
        response_id,
        payload: { state },
    });
};

/* =========================================================
   PARTNER MIRRORING : RESET
========================================================= */
const reset = async (req, res) => {
    const { request_id, response_id } = req.body;
    const tenant_id = req.body?.tenant_id || req.body?.context?.tenant_id;

    if (!tenant_id) {
        return res.status(400).json({
            response_id,
            message: "tenant_id missing",
        });
    }

    try {
        // Disable Partner
        await prisma.partner.updateMany({
            where: { tenantId: tenant_id },
            data: { currentState: "DISABLED" },
        });

        // Disable Customers
        await prisma.customer.updateMany({
            where: { partnerTenantId: tenant_id },
            data: { status: "DISABLED" },
        });

        // ❌ Disable Partner Credentials
        await prisma.parnterCredential.updateMany({
            where: { partnerTenantId: tenant_id },
            data: { active: false },
        });

    } catch (error) {
        console.error("Partner mirroring reset error:", error);
        return res.status(500).json({
            response_id,
            message: "Failed to disable partner and customers",
        });
    }

    return res.json({
        type: "cti.a.p.acgw.response.v1.1~a.p.partner.mirroring.reset.ok.v1.0",
        request_id,
        response_id,
    });
};

module.exports = {
    enable,
    getState,
    reset,
};
