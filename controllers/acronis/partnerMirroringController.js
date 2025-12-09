const prisma = require("../../prismaClient");

// Partner Mirroring Enable
const enable = async (req, res) => {
    const { request_id, response_id, context, payload } = req.body;
    const tenant_id = req.body.tenant_id || context?.tenant_id;

    if (!tenant_id) {
        return res.status(400).json({ response_id, message: "tenant_id missing in callback context" });
    }

    const tenantName = payload?.tenant_name || context?.tenant_name;

    // Check if tenantId already exists
    const existing = await prisma.partner.findFirst({
        where: { tenantId: tenant_id }
    });

    let newEntry;

    if (!existing) {
        // Only create if not exists
        newEntry = await prisma.partner.create({
            data: {
                tenantId: tenant_id,
                tenantName,
                requestId: request_id,
                responseId: response_id,
                currentState: "ENABLED",
            },
        });
    } else {
        // If exists, use the existing record
        newEntry = existing;
    }

    return res.json({
        type: "cti.a.p.acgw.response.v1.1~a.p.partner.mirroring.enable.ok.v1.0",
        request_id,
        response_id,
        payload: {
            state: "ENABLED",
            vendor_tenant_id: String(newEntry.id),
            acronis_tenant_id: newEntry.tenantId,
        },
    });
};

// Partner Mirroring Get State
const getState = async (req, res) => {
    const { request_id, response_id } = req.body;
    const tenant_id = req.body.tenant_id ||  req.body?.context?.tenant_id;

    if (!tenant_id) return res.status(400).json({ response_id, message: "tenant_id missing" });

    const entry = await prisma.partner.findFirst({
        where: { tenantId: tenant_id },
        orderBy: { id: "desc" },
    });

    // let state;
    // if (entry) {
    //     state = entry.currentState?.toUpperCase() || "DISABLED";
    //     if (state === "DISABLED") state = "ENABLED";

    //     await prisma.partner.updateMany({
    //         where: { tenantId: tenant_id },
    //         data: { currentState: state },
    //     });
    // } else {
    //     state = "DISABLED";
    //     await prisma.partner.create({
    //         data: { tenantId: tenant_id, requestId: request_id, responseId: response_id, currentState: "DISABLED" },
    //     });
    // }

    return res.json({
        type: "cti.a.p.acgw.response.v1.1~a.p.partner.mirroring.get_state.ok.v1.0",
        request_id,
        response_id,
        payload: { state:"DISABLED" },
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
        type: "cti.a.p.acgw.response.v1.0~a.p.partner.mirroring.reset.ok.v1.0",
        request_id,
        response_id,
    });
};

module.exports = {
    enable,
    getState,
    reset,
};
