const express = require('express');
const router = express.Router();


const commonMiddleware = require('../middlewares/commonMiddleware');
const parnterContactController = require('../controllers/parnterContactController');
const apiMiddleware = require('../middlewares/apiMiddleware');


router.get('/list',apiMiddleware, parnterContactController.listall);
router.put('/update/:id',apiMiddleware, commonMiddleware, parnterContactController.update);
router.get('/view/:id',apiMiddleware, parnterContactController.view);




module.exports = router;
