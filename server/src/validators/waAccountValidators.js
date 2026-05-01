const { body } = require('express-validator');

exports.connectManualRules = [
  body('accessToken').trim().notEmpty().withMessage('accessToken is required'),
  body('phoneNumberId').trim().notEmpty().withMessage('phoneNumberId is required'),
  body('wabaId').trim().notEmpty().withMessage('wabaId is required'),
];

exports.connectOAuthRules = [
  body('code').trim().notEmpty().withMessage('OAuth code is required'),
];

// All fields optional — user can update just the token, just IDs, or all three
exports.updateAccountRules = [
  body('accessToken').optional({ checkFalsy: true }).trim().notEmpty().withMessage('accessToken cannot be blank'),
  body('phoneNumberId').optional({ checkFalsy: true }).trim().notEmpty().withMessage('phoneNumberId cannot be blank'),
  body('wabaId').optional({ checkFalsy: true }).trim().notEmpty().withMessage('wabaId cannot be blank'),
];
