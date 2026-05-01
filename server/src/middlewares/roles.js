const { AppError } = require('../utils/errors');

function requireAdmin(req, res, next) {
  if (req.authContext?.isAdmin) {
    next();
    return;
  }

  next(new AppError(403, 'ADMIN_ACCESS_REQUIRED', 'Admin access required'));
}

module.exports = {
  requireAdmin,
};
