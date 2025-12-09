const prisma = require("../../prismaClient");
const { v4: uuidv4 } = require("uuid");

// Partner Mirroring Enable

const enable = async (req, res) => {
    const { request_id, context, payload } = req.body;

    const tenant_id = req.body?.tenant_id || context?.tenant_id;

    // Generate NEW response_id for Acronis callback (important)
    const response_id = uuidv4();

    if (!tenant_id) {
        return res.status(400).json({
            response_id,
            message: "tenant_id missing in callback context"
        });
    }

    const tenantName = payload?.tenant_name || context?.tenant_name;

    // Check if tenant already exists
    const existing = await prisma.partner.findFirst({
        where: { tenantId: tenant_id }
    });

    let entry;

    if (!existing) {
        // Create only if not exists
        entry = await prisma.partner.create({
            data: {
                tenantId: tenant_id,
                tenantName,
                requestId: request_id,
                responseId: response_id,
                currentState: "ENABLED"
            },
        });
    } else {
        entry = existing;
    }

    // Acronis expects EXACT schema (no created_at, no extra fields)
    return res.json({
        type: "cti.a.p.acgw.response.v1.1~a.p.partner.mirroring.enable.ok.v1.0",
        request_id,
        response_id,
        payload: {
            state: "ENABLED",
            vendor_tenant_id: String(entry.id),      // must be string
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

    if (!tenant_id) return res.status(400).json({ response_id, message: "tenant_id missing" });

    try {
        await prisma.partner.updateMany({
            where: { tenantId: tenant_id },
            data: { currentState: "DISABLED" },
        });
    } catch (err) {
        return res.status(500).json({ response_id, message: "Failed to disable partner/customers" });
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
