
    const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const modeMiddleware = require('../middlewares/modeMiddleware');
const modeValidations = require('../validators/modeValidator');

const  modeController = require('../controllers/modeController');

router.post('/add', modeValidations,modeMiddleware,modeController.add);
router.get('/view/:id', modeController.get);

router.get('/list',  modeController.list);
router.get('/select',  modeController.select);
router.put('/update/:id',modeValidations,modeMiddleware,modeController.update);
router.delete('/delete/:id',  modeController.delete);

module.exports = router;
