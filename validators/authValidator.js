const { check, validationResult } = require('express-validator');
const { ERROR_MESSAGES, STATUS_CODES } = require('../constants/constants');

const validateLogin = [
    check('email', 'Email is required').not().isEmpty(),
    check('email', 'Must be a valid email').isEmail(),
    check('password', 'Password is required').not().isEmpty(),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateEditProfile = [
    check('firstName', 'First name is required.').not().isEmpty(),
    check('mobileNumber', 'mobileNumber is required.').not().isEmpty(),

];

const validateChangePassword = [
    check('currentPassword', 'Current password is required.').not().isEmpty(),
    check('newPassword', 'New password is required.').not().isEmpty(),
    check('newPassword', 'New password must be at least 6 characters long.').isLength({ min: 6 }),
    check('confirmNewPassword', 'Confirmation password is required.').not().isEmpty(),
    check('confirmNewPassword', 'Confirmation password must match new password.').custom((value, { req }) => {
        if (value !== req.body.newPassword) {
            throw new Error('New password and confirmation password do not match.');
        }
        return true;
    })
];


const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(STATUS_CODES.BAD_REQUEST).json({ errors: errors.array() });
    }
    next();
};

module.exports = {
    validateLogin,
    validateEditProfile,
    validateChangePassword,
    validate

};
