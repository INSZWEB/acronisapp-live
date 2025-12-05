
const { check } = require("express-validator");

const validations = [
    check("moduleName", "moduleName is required.").not().isEmpty(),
];

module.exports = validations;