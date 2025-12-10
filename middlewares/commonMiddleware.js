
const { validationResult } = require("express-validator");

const commonMiddleware = (req, res, next) => {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            errors: errors.array(),
        });
    }
    next();
};

module.exports = commonMiddleware;
