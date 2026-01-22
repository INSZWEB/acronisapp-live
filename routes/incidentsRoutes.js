const express = require('express');
const router = express.Router();

const incidentsController = require('../controllers/incidentsController');
const apiMiddleware = require('../middlewares/apiMiddleware');

router.get('/list',apiMiddleware, incidentsController.listall);
router.get('/view/:id',apiMiddleware, incidentsController.view);
router.post('/update/:id',apiMiddleware, incidentsController.update);

module.exports = router;
