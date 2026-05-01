const PLACEHOLDER_PATTERNS = [
  /^change[_-]?me$/i,
  /^your[_-]/i,
  /^replace[_-]?with/i,
  /^example/i,
];

function looksLikePlaceholder(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksLikeMetaAccessToken(value = '') {
  const normalized = String(value || '').trim();
  return /^EA[A-Za-z0-9]/.test(normalized) && normalized.length >= 40;
}

function isHttpsUrl(value = '') {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isLocalUrl(value = '') {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['localhost', '127.0.0.1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function validateRuntimeConfig(env = process.env) {
  const issues = [];
  const nodeEnv = String(env.NODE_ENV || 'development').toLowerCase();
  const isProd = nodeEnv === 'production';
  const jwtSecret = String(env.JWT_SECRET || '').trim();
  const webhookVerifyToken = String(env.WEBHOOK_VERIFY_TOKEN || '').trim();
  const metaAppSecret = String(env.META_APP_SECRET || '').trim();
  const publicApiBaseUrl = String(env.PUBLIC_API_BASE_URL || '').trim();

  if (isProd) {
    if (!jwtSecret || looksLikePlaceholder(jwtSecret) || jwtSecret.length < 32) {
      issues.push('JWT_SECRET must be set to a strong random secret with at least 32 characters in production.');
    }

    if (!webhookVerifyToken || looksLikePlaceholder(webhookVerifyToken) || webhookVerifyToken.length < 16) {
      issues.push('WEBHOOK_VERIFY_TOKEN must be set to a random non-placeholder value in production.');
    }

    if (publicApiBaseUrl && !isHttpsUrl(publicApiBaseUrl) && !isLocalUrl(publicApiBaseUrl)) {
      issues.push('PUBLIC_API_BASE_URL must use HTTPS in production.');
    }
  }

  if (metaAppSecret) {
    if (looksLikePlaceholder(metaAppSecret)) {
      issues.push('META_APP_SECRET must be replaced with the Meta App Secret from App settings.');
    }

    if (looksLikeMetaAccessToken(metaAppSecret)) {
      issues.push('META_APP_SECRET looks like a Meta access token. Use the App Secret from Meta App settings instead.');
    }
  } else if (isProd) {
    issues.push('META_APP_SECRET is required in production for webhook signature verification.');
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

function assertSafeRuntimeConfig(env = process.env) {
  const validation = validateRuntimeConfig(env);
  if (!validation.ok) {
    const error = new Error(`Unsafe runtime configuration:\n- ${validation.issues.join('\n- ')}`);
    error.code = 'UNSAFE_RUNTIME_CONFIG';
    throw error;
  }
}

module.exports = {
  assertSafeRuntimeConfig,
  looksLikeMetaAccessToken,
  looksLikePlaceholder,
  validateRuntimeConfig,
};
