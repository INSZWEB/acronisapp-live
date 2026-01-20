const express = require('express');
const router = express.Router();


const commonMiddleware = require('../middlewares/commonMiddleware');
const customerController = require('../controllers/customerController');
const apiMiddleware = require('../middlewares/apiMiddleware');

router.post('/add',apiMiddleware, commonMiddleware, customerController.add);
router.get('/list',apiMiddleware, customerController.listall);
router.get('/select', customerController.select);
router.get('/selectsiderbar', customerController.selectSiderbar);
router.put('/update/:id',apiMiddleware, commonMiddleware, customerController.update);
router.get('/view/:id',apiMiddleware, customerController.view);
router.get('/acronis/:id',apiMiddleware, customerController.acronis);
router.delete('/delete/:id',apiMiddleware, customerController.delete);
router.get('/customer',apiMiddleware, customerController.customerlist);




module.exports = router;
