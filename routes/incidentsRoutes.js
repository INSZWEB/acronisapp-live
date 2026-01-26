const express = require('express');
const router = express.Router();

const incidentsController = require('../controllers/incidentsController');
const apiMiddleware = require('../middlewares/apiMiddleware');

router.get('/list',apiMiddleware, incidentsController.listall);
router.get('/view/:id',apiMiddleware, incidentsController.view);
router.post('/update/:id',apiMiddleware, incidentsController.update);
router.get('/action',apiMiddleware, incidentsController.action);
router.post('/execute-action',apiMiddleware, incidentsController.executeaction);
router.get('/action-status',apiMiddleware, incidentsController.getActionStatus);

module.exports = router;
