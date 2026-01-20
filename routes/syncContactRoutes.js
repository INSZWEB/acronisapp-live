const express = require("express");
const router = express.Router();

const {syncPartnerContacts,} = require("../controllers/syncContactController");
const {syncCustomerContactController,} = require("../controllers/syncCustomerContactController");


// POST /api/partners/:partnerTenantId/contacts/sync
router.post(
  "/:partnerTenantId",
  syncPartnerContacts
);

router.post("/customer/:id", syncCustomerContactController);
module.exports = router;
