const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const userMiddleware = require('../middlewares/userMiddleware');
const { addValidations, updateValidations } = require('../validators/userValidator');
const userController = require('../controllers/userController');
const apiMiddleware = require('../middlewares/apiMiddleware');

router.post('/add',apiMiddleware, addValidations, userMiddleware, userController.add);
router.get('/list',apiMiddleware, userController.listall);
router.get('/select', userController.select);
router.get('/searchMail', userController.searchMail);
router.get('/searchTechnican', userController.searchTechnican);
router.get('/selecttechnican', userController.selectTechnican);
router.get('/selectrequester', userController.selectRequester);
router.get('/view/:id',apiMiddleware, userController.view);
router.get('/selectId/:id', userController.selectId);
router.put('/update/:id',apiMiddleware, updateValidations, userMiddleware, userController.update);
router.delete('/delete/:id',apiMiddleware, userController.delete);
router.post('/update-status', authMiddleware, userController.updateStatus);
router.put('/update-verifiedemail', userController.updateVerifiedEmail);




module.exports = router;
