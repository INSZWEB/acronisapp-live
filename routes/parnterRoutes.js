const express = require('express');
const router = express.Router();


const commonMiddleware = require('../middlewares/commonMiddleware');
const parnterController = require('../controllers/parnterController');
const apiMiddleware = require('../middlewares/apiMiddleware');

router.post('/add',apiMiddleware, commonMiddleware, parnterController.add);
router.get('/list',apiMiddleware, parnterController.listall);
router.get('/select', parnterController.select);
router.put('/update/:id',apiMiddleware, commonMiddleware, parnterController.update);
router.get('/view/:id',apiMiddleware, parnterController.view);
router.delete('/delete/:id',apiMiddleware, parnterController.delete);




module.exports = router;
