const { validationResult } = require('express-validator');
const { AppError } = require('../utils/errors');

/**
 * Middleware that reads express-validator results and returns
 * a structured 422 response if any validation errors exist.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(
      422,
      'VALIDATION_FAILED',
      'Validation failed',
      errors.array().map((e) => ({ field: e.path, message: e.msg }))
    ));
  }
  next();
};

module.exports = validate;
