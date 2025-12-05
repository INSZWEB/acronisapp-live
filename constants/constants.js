
const ERROR_MESSAGES = {
    INTERNAL_ERROR: 'Internal server error',
    MODULE_NOT_FOUND: 'Module not found',
    BAD_REQUEST: 'Bad request',
    VALIDATION_ERROR: 'Validation error',
    EMAIL_ALREADY_EXISTS: 'Email already exists.',
    ROLE_NOT_FOUND: 'Role not found',
    INVALID_PAGINATION_PARAMETERS: 'Invalid pagination parameters.',
    USER_NOT_FOUND: 'User not found',
    INVALID_CREDENTIALS: 'Invalid email or password.',
    NO_TOKEN_PROVIDED: 'No token provided.',
    INVALID_TOKEN: 'Invalid token.',
    TOKEN_EXPIRED: 'Token has expired.',
    EMAIL_NOT_VERIFIED: 'Email have been not verified.',
    CHANGE_STATUS_SUCCESS: 'User statuses updated successfully',
    USER_MUST_ARRAY: 'User IDs must be an array and cannot be empty.',
    STATUS_MUST_ACTIVE_INACTIVE: 'Status must be either Active or Inactive.',
    PASSWORDS_DO_NOT_MATCH: 'New password and confirm password do not match.',
    INVALID_CURRENT_PASSWORD: 'Current password is incorrect.',
    LOGIN_SUCCESS: 'Login successful.',
    UNAUTHORIZED_BRANCH: 'Unauthorized access to this branch',
    PROFILE_UPDATE_SUCCESS: 'Profile updated successfully',
    PASSWORD_UPDATE_SUCCESS: 'Password changed successfully',
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    INVALID_ROLE_NAME:"Invalid RoleName",
    INVALID_EMAIL_FORMAT:"Invalid Email Format",
    NO_PERMISSION_TO_LOGIN:"No permission to log in.",
    ACCOUNT_INACTIVE:"Account is temporarily inactive.",
    USER_ROLE_ALREADY_EXITS:"Role Name is Already Exits",
    NAME_ALREADY_EXITS:"Name is Already Exits",
    CATEGORY_ID:"Category not found",
    SUBCATEGORY_ID:" Subcategory not found",
    DATA_NOT_FOUND:"Data not found",
    NO_ROLE_PERMISSIONS:"No Role Permissions",
    STATUS_NOT_FOUND:"Status not found"
  


};

const STATUS_CODES = {
    CREATED: 201,
    OK: 200,
    NO_CONTENT: 204,
    NOT_FOUND: 404,
    INTERNAL_ERROR: 500,
    BAD_REQUEST: 400,
    CONFLICT: 409,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
};

const FORGOT_PASS_EMAIL = {
  SUBJECT: 'Insightz - Password Reset OTP',
  HTML_P_LINE1: 'Dear user,',
  HTML_P_LINE2:
    'You have requested to reset your password. Please use the following 6-digit One-Time Password (OTP) to proceed:',
  HTML_OTP_NOTE: 'This OTP is valid for 15 minutes.',
  HTML_P_LINE3:
    'If you did not request a password reset, please ignore this email. Your account remains secure.',
  HTML_P_LINE4: 'Thank you,',
  HTML_P_LINE5: 'Insightz Team',
  CREATE_SUCCESS: 'OTP has been sent to your registered email address.',
  CREATE_ERROR: 'Error sending OTP email. Please try again later.',
};

const RESET_PASS_EMAIL={
    CHECK_TOKEN:'Invalid or expired token.',
    CREATE_SUCCESS: 'Password has been reset successfully.',
    CREATE_ERROR: 'Error resetting password:',
    EXPIRED_TOKEN: "Your reset link has expired. Please request a new one.",

}


const EMAIL_AUTH = {
  USER: 'kmitech24@gmail.com',
  PASS: 'xkqb lubu rzwt uigj',
  SUBJECT: 'Insightz — Temporary Password',

  HTML_P_LINE1: 'Dear User,',
  HTML_P_LINE3: 'Your temporary password is:',
  HTML_P_LINE5: 'Click here to log in.',
  HTML_P_LINE4: 'For your security, please change this password immediately after your first login.',
  HTML_P_LINE5_1: 'Best regards,',
  HTML_P_LINE5_2: 'The Insightz Support Team',
  

  CREATE_SUCCESS: 'User created successfully. A temporary password has been sent to your registered email.',
  CREATE_ERROR: 'Failed to send temporary password email. Please try again later.',
};


const BASE_URL_FRONTEND='https://support.insightzmss.com:1443/';

module.exports = {
    ERROR_MESSAGES,
    STATUS_CODES,
    FORGOT_PASS_EMAIL,
    RESET_PASS_EMAIL,
    EMAIL_AUTH,
    BASE_URL_FRONTEND
};
