const { PrismaClient } = require("@prisma/client");
const { syncContacts } = require("../services/CustomerContactService");

const prisma = new PrismaClient();

async function syncCustomerContactController(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "id is required",
      });
    }

    // Fetch the customer by id
    const customer = await prisma.customer.findUnique({
      where: { id: parseInt(id) }, // id is Int
      select: {
        partnerTenantId: true,
        acronisCustomerTenantId: true,
      },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const { partnerTenantId, acronisCustomerTenantId } = customer;

    // Pass both IDs to syncContacts
    const result = await syncContacts(partnerTenantId, acronisCustomerTenantId);

    return res.json({
      success: true,
      message: "Contacts synced successfully",
      data: result,
    });
  } catch (err) {
    console.error("Contact sync error:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Failed to sync contacts",
    });
  }
}

module.exports = {
  syncCustomerContactController,
};
