const express = require('express');
const router = express.Router();


const autoInvoiceController = require('../controllers/autoInvoiceController');
const apiMiddleware = require('../middlewares/apiMiddleware');

router.get('/list',apiMiddleware, autoInvoiceController.get);




module.exports = router;
