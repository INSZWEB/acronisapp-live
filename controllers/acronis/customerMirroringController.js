const { v4: uuidv4 } = require("uuid");
const prisma = require("../../prismaClient");

// ------------------------------
// Customer Mirroring - GET STATE
// ------------------------------

/*
const getState = async (req, res) => {
    const { request_id } = req.body;
    const tenant_id = req.body?.tenant_id || req.body?.context?.tenant_id;

    // Generate NEW response_id for Acronis callback
    const response_id = uuidv4();

    if (!tenant_id) {
        return res.status(400).json({
            response_id,
            message: "tenant_id missing",
        });
    }

    const rows = await prisma.partner.findMany({
        where: { tenantId: tenant_id },
        orderBy: { id: "desc" },
    });

    const payload = rows.map(r => ({
        vendor_tenant_id: String(r.id),
        acronis_tenant_id: r.tenantId,
        settings: {},
    }));

    return res.json({
        type: "cti.a.p.acgw.response.v1.1~a.p.customer.mirroring.get_state.ok.v1.0",
        request_id,
        response_id,
        payload,
    });
};
*/

const getState = async (req, res) => {
    const { request_id } = req.body;
    const tenant_id = req.body?.context?.tenant_id;
    const response_id = uuidv4();

    // Fetch ONLY enabled customers
    const enabledCustomers = await prisma.customer.findMany({
        where: {
            partnerTenantId: tenant_id,
            status: "ENABLED",
        },
    });

    const payload = enabledCustomers.map(c => ({
        vendor_tenant_id: String(c.id),
        acronis_tenant_id: c.acronisCustomerTenantId,
        settings: {},
    }));

    return res.json({
        type: "cti.a.p.acgw.response.v1.1~a.p.customer.mirroring.get_state.ok.v1.0",
        request_id,
        response_id,
        payload,
    });
};


// ------------------------------
// Customer Mirroring - SET STATE
// ------------------------------
/*
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

    const partnerTenantName = payload?.partner_tenant_name || "";

    const enabledList = payload?.enabled || [];
    const disabledList = payload?.disabled || [];

    console.log("=== SET STATE PAYLOAD ===");
    console.log("Enabled List:", enabledList);
    console.log("Disabled List:", disabledList);

    // Process ENABLED customers
    for (const customer of enabledList) {
        const { acronis_tenant_id, acronis_tenant_name, settings } = customer;
        if (!acronis_tenant_id) continue;

        await prisma.customer.upsert({
            where: { acronisCustomerTenantId: acronis_tenant_id },
            update: {
                partnerTenantId: tenant_id,
                partnerTenantName,
                acronisCustomerTenantName: acronis_tenant_name,
                status: "ENABLED",
                settings,
            },
            create: {
                partnerTenantId: tenant_id,
                partnerTenantName,
                acronisCustomerTenantId: acronis_tenant_id,
                acronisCustomerTenantName: acronis_tenant_name,
                status: "ENABLED",
                settings,
            },
        });
    }

    // Process DISABLED customers
    for (const customer of disabledList) {
        const { acronis_tenant_id } = customer;
        if (!acronis_tenant_id) continue;

        await prisma.customer.updateMany({
            where: { acronisCustomerTenantId: acronis_tenant_id },
            data: {
                status: "DISABLED",
            },
        });
    }


    return res.json({
        type: "cti.a.p.acgw.response.v1.1~a.p.customer.mirroring.set_state.ok.v1.0",
        request_id,
        response_id,
    });
};
*/

/*
const setState = async (req, res) => {
    const { request_id, payload } = req.body;
    const tenant_id = req.body?.context?.tenant_id;
    const response_id = uuidv4();

    if (!tenant_id) {
        return res.status(400).json({
            response_id,
            message: "tenant_id missing",
        });
    }

    const enabled = payload?.enabled || [];
    const disabled = payload?.disabled || [];

    console.log("=== Payload Received ===");
    console.log("Enabled:", enabled);
    console.log("Disabled:", disabled)

    const enabledIds = enabled.map(c => c.acronis_tenant_id);

    // 1️⃣ Upsert ENABLED customers
    for (const customer of enabled) {
        await prisma.customer.upsert({
            where: { acronisCustomerTenantId: customer.acronis_tenant_id },
            update: {
                partnerTenantId: tenant_id,
                partnerTenantName: payload.partner_tenant_name,
                acronisCustomerTenantName: customer.acronis_tenant_name,
                status: "ENABLED",
            },
            create: {
                partnerTenantId: tenant_id,
                partnerTenantName: payload.partner_tenant_name,
                acronisCustomerTenantId: customer.acronis_tenant_id,
                acronisCustomerTenantName: customer.acronis_tenant_name,
                status: "ENABLED",
            },
        });
    }

    // 2️⃣ Disable all other customers for this partner

    // await prisma.customer.updateMany({
    //     where: {
    //         partnerTenantId: tenant_id,
    //         acronisCustomerTenantId: { notIn: enabledIds },
    //     },
    //     data: { status: "DISABLED" },
    // });









    return res.json({
        type: "cti.a.p.acgw.response.v1.1~a.p.customer.mirroring.set_state.ok.v1.0",
        request_id,
        response_id,
    });
};
*/


// const setState = async (req, res) => {
//     const { request_id, payload } = req.body;
//     const tenant_id = req.body?.context?.tenant_id;
//     const response_id = uuidv4();

//     if (!tenant_id) {
//         return res.status(400).json({
//             response_id,
//             message: "tenant_id missing",
//         });
//     }

//     const enabled = payload?.enabled || [];
//     const disabled = payload?.disabled || [];

//     //   console.log("=== Payload Received ===");
//     //   console.log("Enabled:", enabled);
//     //   console.log("Disabled:", disabled);

//     // Enable customers
//     for (const customer of enabled) {
//         await prisma.customer.upsert({
//             where: { acronisCustomerTenantId: customer.acronis_tenant_id },
//             update: {
//                 partnerTenantId: tenant_id,
//                 partnerTenantName: payload.partner_tenant_name,
//                 acronisCustomerTenantName: customer.acronis_tenant_name,
//                 status: "ENABLED",
//             },
//             create: {
//                 partnerTenantId: tenant_id,
//                 partnerTenantName: payload.partner_tenant_name,
//                 acronisCustomerTenantId: customer.acronis_tenant_id,
//                 acronisCustomerTenantName: customer.acronis_tenant_name,
//                 status: "ENABLED",
//             },
//         });
//     }

//     // Disable customers (only those explicitly in `disabled`)
//     for (const customer of disabled) {
//         if (!customer.acronis_tenant_id) continue;
//         await prisma.customer.updateMany({
//             where: {
//                 partnerTenantId: tenant_id,
//                 acronisCustomerTenantId: customer.acronis_tenant_id
//             },
//             data: { status: "DISABLED" },
//         });
//     }

//     return res.json({
//         type: "cti.a.p.acgw.response.v1.1~a.p.customer.mirroring.set_state.ok.v1.0",
//         request_id,
//         response_id,
//     });
// };


const setState = async (req, res) => {
  const { request_id, payload } = req.body;
  const tenant_id = req.body?.context?.tenant_id;
  const response_id = uuidv4();

  if (!tenant_id) {
    return res.status(400).json({
      response_id,
      message: "tenant_id missing",
    });
  }

  const enabled = payload?.enabled || [];
  const disabled = payload?.disabled || [];

  /* ---------- ENABLE CUSTOMERS ---------- */
  for (const customer of enabled) {
    if (!customer.acronis_tenant_id) continue;

    // Upsert customer
    await prisma.customer.upsert({
      where: { acronisCustomerTenantId: customer.acronis_tenant_id },
      update: {
        partnerTenantId: tenant_id,
        partnerTenantName: payload.partner_tenant_name,
        acronisCustomerTenantName: customer.acronis_tenant_name,
        status: "ENABLED",
      },
      create: {
        partnerTenantId: tenant_id,
        partnerTenantName: payload.partner_tenant_name,
        acronisCustomerTenantId: customer.acronis_tenant_id,
        acronisCustomerTenantName: customer.acronis_tenant_name,
        status: "ENABLED",
      },
    });

    // ✅ Activate credentials
    await prisma.credential.updateMany({
      where: {
        customerTenantId: customer.acronis_tenant_id,
      },
      data: {
        active: true,
      },
    });
  }

  /* ---------- DISABLE CUSTOMERS ---------- */
  for (const customer of disabled) {
    if (!customer.acronis_tenant_id) continue;

    // Disable customer
    await prisma.customer.updateMany({
      where: {
        partnerTenantId: tenant_id,
        acronisCustomerTenantId: customer.acronis_tenant_id,
      },
      data: {
        status: "DISABLED",
      },
    });

    // ❌ Deactivate credentials
    await prisma.credential.updateMany({
      where: {
        customerTenantId: customer.acronis_tenant_id,
      },
      data: {
        active: false,
      },
    });
  }

  return res.json({
    type: "cti.a.p.acgw.response.v1.1~a.p.customer.mirroring.set_state.ok.v1.0",
    request_id,
    response_id,
  });
};



module.exports = {
    getState,
    setState,
};
