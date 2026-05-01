const { body, query } = require('express-validator');

const MESSAGE_TYPES = ['text', 'image', 'document', 'video', 'template'];

exports.sendMessageRules = [
  body('type')
    .optional()
    .isIn(MESSAGE_TYPES)
    .withMessage(`type must be one of: ${MESSAGE_TYPES.join(', ')}`),
  body('content')
    .if(body('type').equals('text'))
    .notEmpty()
    .withMessage('content is required for text messages')
    .isLength({ max: 4096 })
    .withMessage('Message content too long'),
  body('mediaUrl')
    .if(body('type').isIn(['image', 'document', 'video']))
    .notEmpty()
    .withMessage('mediaUrl is required for media messages')
    .isURL()
    .withMessage('mediaUrl must be a valid URL'),
  body('templateName')
    .if(body('type').equals('template'))
    .notEmpty()
    .withMessage('templateName is required for template messages'),
  body('templateLanguage')
    .if(body('type').equals('template'))
    .notEmpty()
    .withMessage('templateLanguage is required for template messages'),
];

exports.getContactsRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer').toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be between 1 and 200').toInt(),
  query('search').optional().trim().isLength({ max: 100 }).withMessage('search too long'),
];
