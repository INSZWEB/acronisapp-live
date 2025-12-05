
const express = require('express');
const router = express.Router();

const validator = require('../middlewares/moduleMiddleware');
const moduleValidator = require('../validators/moduleValidator');
const moduleController = require('../controllers/moduleController');

Object.entries(moduleController).forEach(([funcName, func]) => {
    if (typeof func !== 'function') return;

    switch (funcName) {
        case 'list':
            router.get('/list', func);
            break;
        default:
            break;
    }
});

module.exports = router;
