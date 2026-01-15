const express = require('express');
const router = express.Router();


const commonMiddleware = require('../middlewares/commonMiddleware');
const contractController = require('../controllers/contractController');
const apiMiddleware = require('../middlewares/apiMiddleware');

router.get('/view',apiMiddleware, contractController.contractView);
router.put('/update/:id',apiMiddleware, contractController.update);
router.put('/seats',apiMiddleware, contractController.seats);
router.get('/getpolicy',apiMiddleware, contractController.getpolicy);



module.exports = router;
