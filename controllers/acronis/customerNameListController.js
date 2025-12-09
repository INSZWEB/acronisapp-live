const prisma = require("../../prismaClient");

const customerNameList = async (req, res) => {
    const { tenant_id, request_id, response_id, context } = req.body;
    const partnerTenantId = tenant_id || context?.tenant_id;

    if (!partnerTenantId) return res.status(400).json({ response_id, message: "tenant_id missing" });

    const customers = await prisma.customer.findMany({
        where: { partnerTenantId },
        orderBy: { acronisCustomerTenantName: "asc" },
    });

    const items = customers.map(c => ({
        vendor_tenant_id: c.acronisCustomerTenantId,
        acronis_tenant_id: c.acronisCustomerTenantId,
        name: c.acronisCustomerTenantName,
        status: c.status,
    }));

    return res.json({
        type: "cti.a.p.acgw.response.v1.0~insightz_technology_pte_ltd.insightz_technology.customer_name_list_ok.v1.50",
        request_id,
        response_id,
        payload: { items },
    });
};

module.exports = {
    customerNameList,
};
