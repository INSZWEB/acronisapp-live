const express = require('express');
const router = express.Router();
const { deletes,generateCustomerReport,getAlertReport,getDeviceReport,list } = require('../controllers/reportController');
const {
  task,
} = require("../controllers/acronisTaskController");



router.post('/customer', generateCustomerReport);
router.get("/alert", getAlertReport);
router.get("/devices", getDeviceReport);
router.get("/monthly-report", task);
router.get("/list", list);
router.delete("/delete/:id",deletes);


module.exports = router;
