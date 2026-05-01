const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { sanitizeUser, getOwnerUserId } = require('../utils/authContext');
const { AppError } = require('../utils/errors');

const IS_PROD = process.env.NODE_ENV === 'production';

const COOKIE_OPTIONS = {
  httpOnly: true,          // not accessible via JS — prevents XSS token theft
  secure: IS_PROD,         // HTTPS only in production
  sameSite: 'strict',      // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

const generateToken = (user) =>
  jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const issueCookieAuth = (res, user, statusCode = 200) => {
  const token = generateToken(user);
  res.cookie('token', token, COOKIE_OPTIONS);
  return res.status(statusCode).json({ user: sanitizeUser(user) });
};

const issueMobileAuth = (res, user, statusCode = 200) => {
  const token = generateToken(user);
  return res.status(statusCode).json({ token, user: sanitizeUser(user) });
};

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ where: { email } });
    if (exists) throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'Email already registered');

    const user = await User.create({
      name,
      email,
      password,
      role: 'admin',
      status: 'active',
      mustChangePassword: false,
    });
    if (!user.ownerUserId) {
      await user.update({ ownerUserId: user.id });
    }
    return issueCookieAuth(res, user, 201);
  } catch (error) {
    throw error;
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user || !(await user.comparePassword(password))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    if (String(user.status || 'active').toLowerCase() !== 'active') {
      throw new AppError(403, 'AUTH_ACCOUNT_INACTIVE', 'Your account is inactive. Contact your admin.');
    }
    if (!getOwnerUserId(user)) {
      await user.update({ ownerUserId: user.id });
    }

    return issueCookieAuth(res, user);
  } catch (error) {
    throw error;
  }
};

exports.registerMobile = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ where: { email } });
    if (exists) throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'Email already registered');

    const user = await User.create({
      name,
      email,
      password,
      role: 'admin',
      status: 'active',
      mustChangePassword: false,
    });
    if (!user.ownerUserId) {
      await user.update({ ownerUserId: user.id });
    }
    return issueMobileAuth(res, user, 201);
  } catch (error) {
    throw error;
  }
};

exports.loginMobile = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user || !(await user.comparePassword(password))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    if (String(user.status || 'active').toLowerCase() !== 'active') {
      throw new AppError(403, 'AUTH_ACCOUNT_INACTIVE', 'Your account is inactive. Contact your admin.');
    }
    if (!getOwnerUserId(user)) {
      await user.update({ ownerUserId: user.id });
    }

    return issueMobileAuth(res, user);
  } catch (error) {
    throw error;
  }
};

exports.logout = (req, res) => {
  res.clearCookie('token', { ...COOKIE_OPTIONS, maxAge: 0 });
  res.json({ message: 'Logged out' });
};

exports.me = async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
};

exports.changePassword = async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const nextPassword = String(req.body.newPassword || req.body.password || '');

    if (!nextPassword || nextPassword.trim().length < 6) {
      throw new AppError(400, 'PASSWORD_TOO_SHORT', 'Password must be at least 6 characters');
    }

    if (!currentPassword) {
      throw new AppError(400, 'CURRENT_PASSWORD_REQUIRED', 'Current password is required');
    }

    const isCurrentPasswordValid = await req.user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      throw new AppError(400, 'CURRENT_PASSWORD_INCORRECT', 'Current password is incorrect');
    }

    await req.user.update({
      password: nextPassword,
      mustChangePassword: false,
    });

    res.json({ user: sanitizeUser(req.user) });
  } catch (error) {
    throw error;
  }
};
