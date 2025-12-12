const { v4: uuidv4 } = require("uuid");
const prisma = require("../../prismaClient");

/* ----------------------------------------------------
   CUSTOMER MIRRORING - GET STATE
   ---------------------------------------------------- */
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

    // Fetch all customers for this partner
    const customers = await prisma.customer.findMany({
        where: { partnerTenantId: tenant_id },
    });

    // Prepare enabled / disabled lists
    const enabled = [];
    const disabled = [];

    for (const c of customers) {
        const entry = {
            acronis_tenant_id: c.acronisCustomerTenantId,
            acronis_tenant_name: c.acronisCustomerTenantName,
            settings: {
                enabled: c.status === "ENABLED",
                ...c.settings,
            }
        };

        if (c.status === "ENABLED") enabled.push(entry);
        else disabled.push(entry);
    }

    return res.json({
        type: "cti.a.p.acgw.response.v1.1~a.p.customer.mirroring.get_state.ok.v1.0",
        request_id,
        response_id,
        payload: {
            partner_tenant_id: tenant_id,
            enabled,
            disabled
        }
    });
};


/* ----------------------------------------------------
   CUSTOMER MIRRORING - SET STATE
   ---------------------------------------------------- */
const setState = async (req, res) => {
    const { request_id, payload } = req.body;
    const tenant_id = req.body?.tenant_id || req.body?.context?.tenant_id;

    const response_id = uuidv4();

    if (!tenant_id) {
        return res.status(400).json({
            response_id,
            message: "tenant_id missing",
        });
    }

    const enabledList = payload?.enabled || [];
    const disabledList = payload?.disabled || [];

    console.log("=== SET STATE PAYLOAD ===");
    console.log("Enabled:", enabledList);
    console.log("Disabled:", disabledList);

    // ENABLED
    for (const customer of enabledList) {
        const { acronis_tenant_id, acronis_tenant_name, settings } = customer;
        if (!acronis_tenant_id) continue;

        await prisma.customer.upsert({
            where: { acronisCustomerTenantId: acronis_tenant_id },
            update: {
                partnerTenantId: tenant_id,
                acronisCustomerTenantName: acronis_tenant_name,
                status: "ENABLED",
                settings
            },
            create: {
                partnerTenantId: tenant_id,
                acronisCustomerTenantId: acronis_tenant_id,
                acronisCustomerTenantName: acronis_tenant_name,
                status: "ENABLED",
                settings
            }
        });
    }

    // DISABLED
    for (const customer of disabledList) {
        const { acronis_tenant_id } = customer;
        if (!acronis_tenant_id) continue;

        await prisma.customer.updateMany({
            where: { acronisCustomerTenantId: acronis_tenant_id },
            data: { status: "DISABLED" }
        });
    }

    return res.json({
        type: "cti.a.p.acgw.response.v1.1~a.p.customer.mirroring.set_state.ok.v1.0",
        request_id,
        response_id
    });
};


module.exports = {
    getState,
    setState,
};
