
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');

const roleMiddleware = require('../middlewares/roleMiddleware');
const { addValidations,updateValidations } = require('../validators/roleValidator');
const userRoleController = require('../controllers/userRoleController');

router.post('/add', addValidations, roleMiddleware, userRoleController.add);
router.get('/view/:id', userRoleController.view);
router.get('/list', userRoleController.list);
router.put('/update/:id', updateValidations, roleMiddleware, userRoleController.update);
router.delete('/delete/:id',  userRoleController.delete);
module.exports = router;
