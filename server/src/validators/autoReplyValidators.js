const { body } = require('express-validator');

const REPLY_TYPES = ['keyword', 'greeting', 'away'];
const MATCH_TYPES = ['exact', 'contains'];

exports.createAutoReplyRules = [
  body('type')
    .isIn(REPLY_TYPES)
    .withMessage(`type must be one of: ${REPLY_TYPES.join(', ')}`),
  body('replyText')
    .trim()
    .notEmpty()
    .withMessage('replyText is required')
    .isLength({ max: 4096 })
    .withMessage('replyText too long'),
  body('keyword')
    .if(body('type').equals('keyword'))
    .trim()
    .notEmpty()
    .withMessage('keyword is required when type is "keyword"')
    .isLength({ max: 200 })
    .withMessage('keyword too long'),
  body('matchType')
    .if(body('type').equals('keyword'))
    .isIn(MATCH_TYPES)
    .withMessage(`matchType must be one of: ${MATCH_TYPES.join(', ')}`),
  body('scheduleStart')
    .optional({ nullable: true })
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('scheduleStart must be in HH:MM format'),
  body('scheduleEnd')
    .optional({ nullable: true })
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('scheduleEnd must be in HH:MM format'),
  body('scheduleDays')
    .optional({ nullable: true })
    .isArray()
    .withMessage('scheduleDays must be an array'),
  body('scheduleDays.*')
    .optional()
    .isInt({ min: 0, max: 6 })
    .withMessage('scheduleDays values must be 0-6 (Sunday=0, Saturday=6)'),
];

exports.updateAutoReplyRules = [
  body('replyText')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('replyText cannot be empty')
    .isLength({ max: 4096 })
    .withMessage('replyText too long'),
];
