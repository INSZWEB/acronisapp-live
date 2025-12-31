const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const apiMiddleware = require('../middlewares/apiMiddleware');

router.get('/list',apiMiddleware, categoryController.listall);
router.get('/count',apiMiddleware, categoryController.alertCategory);
router.get('/migration',apiMiddleware, categoryController.alertMigration);
router.get('/alert',apiMiddleware, categoryController.alertSummary);
router.get('/device',apiMiddleware, categoryController.alertDevice);



module.exports = router;
