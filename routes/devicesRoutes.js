const express = require('express');
const router = express.Router();


const commonMiddleware = require('../middlewares/commonMiddleware');
const deviceController = require('../controllers/deviceController');
const apiMiddleware = require('../middlewares/apiMiddleware');

router.post('/add',apiMiddleware, commonMiddleware, deviceController.add);
router.get('/list',apiMiddleware, deviceController.listall);
router.get('/select', deviceController.select);
router.put('/update/:id',apiMiddleware, commonMiddleware, deviceController.update);
router.get('/view/:id',apiMiddleware, deviceController.view);
router.delete('/delete/:id',apiMiddleware, deviceController.delete);




module.exports = router;
