const express = require("express");
const router = express.Router();
const settingsController = require("../controllers/settingsController");

// Separate update endpoints
router.post("/update-log-interval", settingsController.updateLogInterval);
router.post("/update-device-interval", settingsController.updateDeviceInterval);

module.exports = router;
