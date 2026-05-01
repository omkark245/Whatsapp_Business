const crypto = require('crypto');

const IS_PROD = process.env.NODE_ENV === 'production';

class AppError extends Error {
  constructor(statusCode, code, message, details = []) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = Array.isArray(details) ? details : [details].filter(Boolean);
    this.isOperational = true;
    Error.captureStackTrace?.(this, AppError);
  }
}

function createRequestId() {
  return crypto.randomUUID();
}

function asyncHandler(fn) {
  return function wrappedAsyncHandler(req, res, next) {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function getMetaError(error) {
  return error?.response?.data?.error || error?.error || error?.data?.error || null;
}

function normalizeMetaError(error) {
  const metaError = getMetaError(error);
  if (!metaError) return null;

  const code = Number(metaError.code || error?.code || 0);
  const subcode = Number(metaError.error_subcode || 0);
  const rawMessage =
    metaError.error_user_msg ||
    metaError.message ||
    metaError.title ||
    error?.message ||
    'Meta request failed';

  if (code === 131047) {
    return {
      statusCode: 400,
      code: 'WHATSAPP_REENGAGEMENT_REQUIRED',
      message:
        'Message failed because more than 24 hours have passed since the customer last replied. Use an approved template campaign to re-engage this customer.',
      details: [{ provider: 'meta', providerCode: code, providerSubcode: subcode }],
    };
  }

  if (code === 131042) {
    return {
      statusCode: 402,
      code: 'META_PAYMENT_METHOD_ERROR',
      message: 'Message failed because there were one or more errors related to your Meta payment method.',
      details: [{ provider: 'meta', providerCode: code, providerSubcode: subcode }],
    };
  }

  if (code === 190 || /session has expired|access token/i.test(rawMessage)) {
    return {
      statusCode: 401,
      code: 'META_ACCESS_TOKEN_EXPIRED',
      message: 'WhatsApp access token expired. Reconnect this account in Settings with a new permanent token.',
      details: [{ provider: 'meta', providerCode: code, providerSubcode: subcode }],
    };
  }

  if (code === 100 && subcode === 33) {
    return {
      statusCode: 403,
      code: 'META_PERMISSION_ERROR',
      message:
        'Meta cannot access this WhatsApp asset. Reconnect the account in Settings with a token that has access to the saved WABA ID and Phone Number ID.',
      details: [{
        provider: 'meta',
        providerCode: code,
        providerSubcode: subcode,
        message: 'Check that WABA ID, Phone Number ID, and access token all belong to the same WhatsApp Business Account.',
      }],
    };
  }

  if ([10, 200, 2635].includes(code) || /permission/i.test(rawMessage)) {
    return {
      statusCode: 403,
      code: 'META_PERMISSION_ERROR',
      message: 'Meta rejected this request because the app or token does not have the required permission.',
      details: [{ provider: 'meta', providerCode: code, providerSubcode: subcode }],
    };
  }

  if ([100, 131009, 132000, 132001].includes(code) || /parameter|template/i.test(rawMessage)) {
    return {
      statusCode: 400,
      code: 'META_INVALID_PARAMETER',
      message: rawMessage || 'Meta rejected this request because a parameter is invalid.',
      details: [{ provider: 'meta', providerCode: code, providerSubcode: subcode }],
    };
  }

  return {
    statusCode: error?.response?.status || 400,
    code: 'META_REQUEST_FAILED',
    message: rawMessage,
    details: [{ provider: 'meta', providerCode: code || undefined, providerSubcode: subcode || undefined }],
  };
}

function normalizeSequelizeError(error) {
  if (!error?.name?.startsWith('Sequelize')) return null;

  if (error.name === 'SequelizeValidationError') {
    return {
      statusCode: 422,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      details: error.errors?.map((item) => ({ field: item.path, message: item.message })) || [],
    };
  }

  if (error.name === 'SequelizeUniqueConstraintError') {
    return {
      statusCode: 409,
      code: 'DUPLICATE_RECORD',
      message: 'A record with this value already exists.',
      details: error.errors?.map((item) => ({ field: item.path, message: item.message })) || [],
    };
  }

  if (error.name === 'SequelizeForeignKeyConstraintError') {
    return {
      statusCode: 400,
      code: 'INVALID_RELATION',
      message: 'The selected related record is invalid or no longer exists.',
      details: [],
    };
  }

  const dbCode = error.parent?.code || error.original?.code;
  if (dbCode === '42703' || /column .* does not exist/i.test(error.message || '')) {
    return {
      statusCode: 503,
      code: 'DB_SCHEMA_OUT_OF_DATE',
      message: 'Database schema is out of date. Run migrations on the server, then restart the backend.',
      details: [],
    };
  }

  if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.parent?.code || error.original?.code)) {
    return {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database is not reachable right now. Please try again after the server reconnects.',
      details: [],
    };
  }

  return {
    statusCode: 500,
    code: 'DATABASE_ERROR',
    message: 'Database request failed.',
    details: [],
  };
}

function normalizeError(error) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details || [],
    };
  }

  if (error?.type === 'entity.too.large') {
    return {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload is too large.',
      details: [],
    };
  }

  if (error?.code === 'LIMIT_FILE_SIZE') {
    return {
      statusCode: 413,
      code: 'UPLOAD_TOO_LARGE',
      message: 'Uploaded file is too large.',
      details: [],
    };
  }

  if (error?.code === 'LIMIT_UNEXPECTED_FILE') {
    return {
      statusCode: 400,
      code: 'UPLOAD_FIELD_NOT_ALLOWED',
      message: 'This upload field is not allowed.',
      details: [],
    };
  }

  if (error?.name === 'TokenExpiredError') {
    return {
      statusCode: 401,
      code: 'AUTH_TOKEN_EXPIRED',
      message: 'Invalid or expired token',
      details: [],
    };
  }

  if (error?.name === 'JsonWebTokenError') {
    return {
      statusCode: 401,
      code: 'AUTH_INVALID',
      message: 'Invalid or expired token',
      details: [],
    };
  }

  if (/^CORS blocked origin:/i.test(error?.message || '')) {
    return {
      statusCode: 403,
      code: 'CORS_ORIGIN_BLOCKED',
      message: 'This website origin is not allowed to access the API.',
      details: [],
    };
  }

  const metaError = normalizeMetaError(error);
  if (metaError) return metaError;

  const sequelizeError = normalizeSequelizeError(error);
  if (sequelizeError) return sequelizeError;

  const statusCode = Number(error?.statusCode || error?.status || 500);
  return {
    statusCode: statusCode >= 400 && statusCode < 600 ? statusCode : 500,
    code: error?.code && typeof error.code === 'string' ? error.code : 'INTERNAL_SERVER_ERROR',
    message: statusCode < 500 && error?.message ? error.message : 'Internal server error',
    details: Array.isArray(error?.details) ? error.details : [],
  };
}

function formatErrorPayload(normalized, requestId, error) {
  const payload = {
    success: false,
    error: normalized.message,
    code: normalized.code,
    requestId,
    errorInfo: {
      message: normalized.message,
      code: normalized.code,
      status: normalized.statusCode,
      requestId,
      details: normalized.details || [],
    },
  };

  if (normalized.details?.length) {
    payload.details = normalized.details;
  }

  if (!IS_PROD && error?.stack) {
    payload.stack = error.stack;
  }

  return payload;
}

function logError(error, req, normalized = normalizeError(error)) {
  const logPayload = {
    requestId: req?.requestId,
    method: req?.method,
    path: req?.originalUrl || req?.url,
    userId: req?.user?.id,
    statusCode: normalized.statusCode,
    code: normalized.code,
    message: normalized.message || error?.message,
    stack: error?.stack,
  };

  if (error?.message && error.message !== logPayload.message) {
    logPayload.rawMessage = error.message;
  }

  if (normalized.details?.length) {
    logPayload.details = normalized.details;
  }

  if (normalized.statusCode >= 500) {
    console.error('Request failed', logPayload);
    return;
  }

  console.warn('Request rejected', logPayload);
}

function logBackgroundError(scope, error, extra = {}) {
  const normalized = normalizeError(error);
  const logPayload = {
    scope,
    statusCode: normalized.statusCode,
    code: normalized.code,
    message: normalized.message || error?.message,
    stack: error?.stack,
    ...extra,
  };

  if (error?.message && error.message !== logPayload.message) {
    logPayload.rawMessage = error.message;
  }

  if (normalized.details?.length) {
    logPayload.details = normalized.details;
  }

  if (normalized.statusCode >= 500) {
    console.error('Background job failed', logPayload);
    return;
  }

  console.warn('Background job rejected', logPayload);
}

module.exports = {
  AppError,
  asyncHandler,
  createRequestId,
  formatErrorPayload,
  logBackgroundError,
  logError,
  normalizeError,
};
