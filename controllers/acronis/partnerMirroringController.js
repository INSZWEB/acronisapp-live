const prisma = require("../../prismaClient");
const { v4: uuidv4 } = require("uuid");

// Partner Mirroring Enable

const enable = async (req, res) => {
    const { request_id, context, payload } = req.body;
    const extra = req.cyberAppExtra;

    console.log("✅ Extra inside enable():", extra);

    const tenant_id = req.body?.tenant_id || context?.tenant_id;
    const response_id = uuidv4();

    if (!tenant_id) {
        return res.status(400).json({
            response_id,
            message: "tenant_id missing in callback context"
        });
    }

    // Tenant name resolution
    const tenantName =
        payload?.acronis_tenant_name ||
        payload?.tenant_name ||
        context?.acronis_tenant_name ||
        context?.tenant_name ||
        null;

    // ✅ Extract fields from X-CyberApp-Extra
    const contactName = extra["Enter the name"] || null;
    const contactEmail = extra["Enter the email"] || null;
    const preferredSlot = extra["Timeslot"] || null;
    const timeZone = extra["Time Zone"] || null;
    const preferredDate = extra["enter the date"] || null;

    // Check if tenant already exists
    const existing = await prisma.partner.findFirst({
        where: { tenantId: tenant_id }
    });

    let entry;

    if (!existing) {
        entry = await prisma.partner.create({
            data: {
                tenantId: tenant_id,
                tenantName,
                requestId: request_id,
                responseId: response_id,
                currentState: "ENABLED",

                // ✅ Store extra fields
                contactName,
                contactEmail,
                PreferredSlot: preferredSlot,
                TimeZone: timeZone,
                preferredDate: new Date(preferredDate)
            }
        });
    } else {
        entry = await prisma.partner.update({
            where: { id: existing.id },
            data: {
                tenantName,
                requestId: request_id,
                responseId: response_id,
                currentState: "ENABLED",

                // ✅ Update extra fields
                contactName,
                contactEmail,
                PreferredSlot: preferredSlot,
                TimeZone: timeZone,
                preferredDate: new Date(preferredDate)
            }
        });
    }

    // Acronis expects strict response schema
    return res.json({
        type: "cti.a.p.acgw.response.v1.1~a.p.partner.mirroring.enable.ok.v1.0",
        request_id,
        response_id,
        payload: {
            state: "ENABLED",
            vendor_tenant_id: String(entry.id),
            acronis_tenant_id: entry.tenantId
        }
    });
};



// Partner Mirroring Get State
const getState = async (req, res) => {
    const { request_id } = req.body;
    const tenant_id = req.body?.tenant_id || req.body?.context?.tenant_id;

    if (!tenant_id) {
        return res.status(400).json({
            response_id: null,
            message: "tenant_id missing"
        });
    }

    // Generate new response_id
    const response_id = uuidv4();

    // Find latest partner record
    const entry = await prisma.partner.findFirst({
        where: { tenantId: tenant_id },
        orderBy: { id: "desc" }
    });

    let state;

    if (entry) {
        state = entry.currentState?.toUpperCase() || "DISABLED";

        // Update existing records
        await prisma.partner.updateMany({
            where: { tenantId: tenant_id },
            data: { currentState: state }
        });

    } else {
        // First time tenant → create entry
        state = "DISABLED";

        await prisma.partner.create({
            data: {
                tenantId: tenant_id,
                requestId: request_id,
                responseId: response_id,
                currentState: "DISABLED"
            }
        });
    }

    // Add timestamp as required by Acronis
    // const created_at = new Date().toISOString();

    // Response format required by Acronis
    return res.json({
        type: "cti.a.p.acgw.response.v1.1~a.p.partner.mirroring.get_state.ok.v1.0",
        request_id: request_id,
        response_id: response_id,
        // created_at: created_at,
        payload: {
            state: state
        }
    });
};


// Partner Mirroring Reset
const reset = async (req, res) => {
    const { request_id, response_id } = req.body;
    const tenant_id = req.body.tenant_id || req.body?.context?.tenant_id;

    // ❌ Validation
    if (!tenant_id) {
        return res.status(400).json({
            response_id,
            message: "tenant_id missing",
        });
    }

    try {
        // ✅ Disable Partner
        await prisma.partner.updateMany({
            where: { tenantId: tenant_id },
            data: { currentState: "DISABLED" },
        });

        // ✅ Disable ALL customers under this partner
        await prisma.customer.updateMany({
            where: { partnerTenantId: tenant_id },
            data: { status: "DISABLED" },
        });

    } catch (error) {
        console.error("Partner mirroring reset error:", error);
        return res.status(500).json({
            response_id,
            message: "Failed to disable partner and customers",
        });
    }

    // ✅ Success response
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
