const express = require('express');
const router = express.Router();
const { generateCustomerReport } = require('../controllers/reportController');

router.get('/customer', generateCustomerReport);

module.exports = router;
