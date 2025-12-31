const express = require('express');
const router = express.Router();


const commonMiddleware = require('../middlewares/commonMiddleware');
const customerContactController = require('../controllers/customerContactController');
const apiMiddleware = require('../middlewares/apiMiddleware');


router.post('/add',apiMiddleware, customerContactController.add);
router.get('/list',apiMiddleware, customerContactController.listall);
router.put('/update/:id',apiMiddleware, commonMiddleware, customerContactController.update);
router.get('/view/:id',apiMiddleware, customerContactController.view);
router.get('/emergency/:id',apiMiddleware, customerContactController.emergency);
router.post('/updateEmergency/:id',apiMiddleware, customerContactController.upsertEmergencyEscalation);
router.delete('/delete/:id',apiMiddleware, customerContactController.delete);




module.exports = router;
