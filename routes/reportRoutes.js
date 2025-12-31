const express = require('express');
const router = express.Router();
const { generateCustomerReport,getAlertReport,getDeviceReport } = require('../controllers/reportController');

router.post('/customer', generateCustomerReport);
router.get("/alert", getAlertReport);
router.get("/devices", getDeviceReport);

module.exports = router;
