const express = require('express');
const router = express.Router();
const { generateCustomerReport } = require('../controllers/invoiceController');

router.post('/customer', generateCustomerReport);
module.exports = router;
