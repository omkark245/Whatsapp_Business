const { body } = require('express-validator');

exports.createCampaignRules = [
  body('name').trim().notEmpty().withMessage('Campaign name is required').isLength({ max: 200 }).withMessage('Name too long'),
  body('templateId').notEmpty().withMessage('Template is required').isInt({ min: 1 }).withMessage('Template is invalid'),
  body('groupId').notEmpty().withMessage('Contact group is required').isInt({ min: 1 }).withMessage('Contact group is invalid'),
  body('scheduledAt').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Schedule must be a valid date and time'),
  body('sendIntervalSeconds')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 0, max: 3600 })
    .withMessage('Send interval must be a whole number between 0 and 3600 seconds'),
];
