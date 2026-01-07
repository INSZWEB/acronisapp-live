const express = require('express');
const multer = require('multer');
const path = require('path');

const router = express.Router();

const verifyToken = require('../middlewares/verifyToken')
const { validateLogin, validateEditProfile, validateChangePassword, validate } = require('../validators/authValidator');
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');


// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Destination folder
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // File name
    }
});

const upload = multer({ storage: storage });




// Route for login
router.post('/login', validateLogin, authController.login);
router.get('/view-profile', authController.viewProfile);
router.get('/view-image', authController.viewImage);
router.put('/edit-profile', validateEditProfile, validate, authController.editProfile);
router.post('/change-password', authController.changePassword);
router.post('/new-password', authController.newPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/forgot-password',authController.forgotPassword);
router.post('/verify-otp',authController.verifyOTP);
// Route for checking authentication
router.get("/checkAuth", authController.checkAuth);
router.post("/verify-token", authController.verifyTokenController);
router.put('/update-verifiedemail', authController.updateVerifiedEmail);

// Route for logout
router.post("/logout", authController.logout);
// Endpoint to update profile image
router.post('/update-profile-image', upload.single('profileImage'),authController.uploadImage);


router.post('/mfa/setup',authController.setupMfa);
router.post('/otp-verify',authController.otpVerify);


module.exports = router;
