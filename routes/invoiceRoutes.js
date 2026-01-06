const express = require('express');
const router = express.Router();
const { generateCustomerReport, list, paymentStatus,deletes } = require('../controllers/invoiceController');

router.post('/customer', generateCustomerReport);
router.get('/list', list);
router.put("/payment-status",paymentStatus);
router.delete("/delete/:id",deletes);
module.exports = router;
