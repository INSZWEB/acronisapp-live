
const { check } = require("express-validator");

const addValidations = [
    check('firstName', 'First name is required.').not().isEmpty()

];

const updateValidations = [
    check('firstName', 'First name is required.').not().isEmpty()

];

module.exports = {
    addValidations,
    updateValidations
};