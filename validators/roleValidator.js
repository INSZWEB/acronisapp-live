
const { check } = require("express-validator");

const addValidations = [
    check('roleName', 'Role Name is required.').not().isEmpty()

];

const updateValidations = [
    check('roleName', 'Role Name is required.').not().isEmpty()
];

module.exports = {
    addValidations,
    updateValidations
};