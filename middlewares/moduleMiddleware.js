
const { validationResult } = require("express-validator");

const moduleMiddleware = (req, res, next) => {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            errors: errors.array(),
        });
    }
    next();
};

module.exports = moduleMiddleware;
