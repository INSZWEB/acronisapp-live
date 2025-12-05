
const { check } = require("express-validator");

const addValidations = [
    check('name', 'Name is required.').not().isEmpty(),
];

const updateValidations = [
    check('name', 'Name is required.').not().isEmpty(),
];
module.exports = {
    addValidations,
    updateValidations
};