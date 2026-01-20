const express = require("express");
const router = express.Router();
const settingsController = require("../controllers/settingsController");

// Separate update endpoints
router.post("/update-log-interval", settingsController.updateLogInterval);
router.post("/update-device-interval", settingsController.updateDeviceInterval);
router.get("/get/mailcc", settingsController.getMailCC);
router.post("/update/mailcc", settingsController.upsertMailCC);
router.get("/interval", settingsController.getAllSettings);
module.exports = router;
