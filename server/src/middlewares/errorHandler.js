const { formatErrorPayload, logError, normalizeError } = require('../utils/errors');

// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  const normalized = normalizeError(error);
  logError(error, req, normalized);

  if (res.headersSent) {
    next(error);
    return;
  }

  res.status(normalized.statusCode).json(formatErrorPayload(normalized, req.requestId, error));
}

module.exports = errorHandler;
