const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { buildAuthContext } = require('./authContext');

function parseCookieHeader(cookieHeader = '') {
  return String(cookieHeader)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return cookies;

      const key = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function extractSocketToken(socket) {
  const authToken = socket.handshake.auth?.token;
  if (authToken) return authToken;

  const authorization = socket.handshake.headers?.authorization;
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }

  return parseCookieHeader(socket.handshake.headers?.cookie).token || null;
}

async function authenticateSocket(socket) {
  const token = extractSocketToken(socket);
  if (!token) return null;

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (!decoded?.id) return null;

  const user = await User.findByPk(decoded.id);
  if (!user || String(user.status || 'active').toLowerCase() !== 'active') {
    return null;
  }

  return {
    user,
    authContext: buildAuthContext(user),
  };
}

module.exports = {
  authenticateSocket,
  extractSocketToken,
  parseCookieHeader,
};
