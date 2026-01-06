const express = require("express");
const router = express.Router();

const {
  syncPartnerContacts,
} = require("../controllers/syncContactController");

// POST /api/partners/:partnerTenantId/contacts/sync
router.post(
  "/:partnerTenantId",
  syncPartnerContacts
);

module.exports = router;
