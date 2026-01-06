const { syncContacts } = require("../services/acronisContactService");

async function syncPartnerContacts(req, res) {
  try {
    const { partnerTenantId } = req.params;

    if (!partnerTenantId) {
      return res.status(400).json({
        success: false,
        message: "partnerTenantId is required",
      });
    }

    const result = await syncContacts(partnerTenantId);

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
  syncPartnerContacts,
};
