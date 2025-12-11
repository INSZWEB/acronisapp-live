const express = require('express');
const router = express.Router();


const commonMiddleware = require('../middlewares/commonMiddleware');
const alertsController = require('../controllers/alertsController');
const apiMiddleware = require('../middlewares/apiMiddleware');

router.post('/add',apiMiddleware, commonMiddleware, alertsController.add);
router.get('/list',apiMiddleware, alertsController.listall);
router.get('/select', alertsController.select);
router.get('/count', alertsController.count);
router.put('/update/:id',apiMiddleware, commonMiddleware, alertsController.update);
router.get('/view/:id',apiMiddleware, alertsController.view);
router.delete('/delete/:id',apiMiddleware, alertsController.delete);




module.exports = router;
