const { body } = require('express-validator');

exports.createDripCampaignRules = [
  body('name').trim().notEmpty().withMessage('Campaign name is required').isLength({ max: 200 }).withMessage('Name too long'),
  body('groupId').notEmpty().withMessage('groupId is required'),
  body('steps')
    .isArray({ min: 1 })
    .withMessage('steps must be a non-empty array'),
  body('steps.*.templateId')
    .notEmpty()
    .withMessage('Each step must have a templateId'),
  body('steps.*.delayMinutes')
    .isInt({ min: 0 })
    .withMessage('Each step delayMinutes must be a non-negative integer'),
];
