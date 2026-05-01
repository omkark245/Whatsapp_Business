const { createRequestId } = require('../utils/errors');

function requestId(req, res, next) {
  const incomingRequestId = req.get('X-Request-Id');
  req.requestId = incomingRequestId || createRequestId();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

module.exports = requestId;
