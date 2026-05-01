const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { buildAuthContext } = require('../utils/authContext');
const { AppError } = require('../utils/errors');

/**
 * Auth middleware — reads JWT from httpOnly cookie first,
 * then falls back to Bearer token header (for API clients / Postman).
 */
const auth = async (req, res, next) => {
  try {
    // Prefer cookie (browser), fallback to Authorization header (API clients)
    const token =
      req.cookies?.token ||
      req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user) return next(new AppError(401, 'AUTH_USER_NOT_FOUND', 'User not found'));
    if (String(user.status || 'active').toLowerCase() !== 'active') {
      return next(new AppError(403, 'AUTH_ACCOUNT_INACTIVE', 'Your account is inactive. Contact your admin.'));
    }

    req.user = user;
    req.authContext = buildAuthContext(user);
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = auth;
