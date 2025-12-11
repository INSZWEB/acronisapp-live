const express = require('express');
const router = express.Router();


const commonMiddleware = require('../middlewares/commonMiddleware');
const credentialController = require('../controllers/credentialController');
const apiMiddleware = require('../middlewares/apiMiddleware');

router.post('/add',apiMiddleware, commonMiddleware, credentialController.add);
router.get('/list',apiMiddleware, credentialController.listall);
router.get('/select', credentialController.select);
router.put('/update/:id',apiMiddleware, commonMiddleware, credentialController.update);
router.get('/view/:id',apiMiddleware, credentialController.view);
router.delete('/delete/:id',apiMiddleware, credentialController.delete);




module.exports = router;
