import toast from 'react-hot-toast';

const NETWORK_ERROR_MESSAGE = 'Unable to reach server. Please check your connection or try again.';

const CODE_MESSAGES = {
  ADMIN_ACCESS_REQUIRED: 'You do not have access to this action.',
  AUTH_ACCOUNT_INACTIVE: 'Your account is inactive. Contact your admin.',
  AUTH_INVALID: 'Your session expired. Please login again.',
  AUTH_REQUIRED: 'Please login to continue.',
  AUTH_TOKEN_EXPIRED: 'Your session expired. Please login again.',
  CONTACT_NOT_FOUND: 'Contact not found.',
  CONTACT_OWNERSHIP_MISMATCH: 'One or more contacts do not belong to this account.',
  DB_SCHEMA_OUT_OF_DATE: 'Database needs migration on the server. Run migrations, then restart the backend.',
  GROUP_NOT_FOUND: 'Group not found.',
  INVALID_PHONE_NUMBER: 'Enter a valid Indian phone number.',
  LABEL_NOT_FOUND: 'Label not found.',
  META_ACCESS_TOKEN_EXPIRED: 'WhatsApp access token expired. Reconnect this account in Settings.',
  META_APP_ID_INVALID: 'Server META_APP_ID is missing or invalid. Set the numeric Meta app ID and redeploy.',
  META_PAYMENT_METHOD_ERROR: 'Payment method issue in Meta. Check WhatsApp Business billing/payment settings.',
  META_TEMPLATE_HEADER_UPLOAD_APP_ACCESS: 'Template header upload failed. Check that META_APP_ID and the WhatsApp token belong to the same Meta app/business setup.',
  PHONE_REQUIRED: 'Phone number is required.',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  TEAM_ACCESS_DENIED: 'You do not have access to this team resource.',
  VALIDATION_FAILED: 'Please check the highlighted fields and try again.',
  WHATSAPP_CREDENTIALS_INCOMPLETE: 'WhatsApp account credentials are incomplete.',
  WHATSAPP_REENGAGEMENT_REQUIRED: 'Use an approved template campaign for customers who have not replied in 24 hours.',
  WHATSAPP_RECONNECT_REQUIRED: 'Reconnect this WhatsApp account before sending messages.',
  WHATSAPP_TOKEN_APP_MISMATCH: 'This WhatsApp token belongs to a different Meta app. Generate the permanent token from the configured META_APP_ID, then reconnect.',
};

function getPayload(error) {
  return error?.response?.data || error?.data || error?.errorInfo || null;
}

function getErrorInfo(error) {
  const payload = getPayload(error);
  return payload?.errorInfo || payload || {};
}

export function getApiErrorCode(error) {
  const info = getErrorInfo(error);
  return info?.code || getPayload(error)?.code || error?.errorCode || error?.code || '';
}

export function getApiRequestId(error) {
  const info = getErrorInfo(error);
  return info?.requestId || getPayload(error)?.requestId || error?.requestId || '';
}

export function getApiErrorDetails(error) {
  const info = getErrorInfo(error);
  const details = info?.details || getPayload(error)?.details || [];
  return Array.isArray(details) ? details : [details].filter(Boolean);
}

export function getApiErrorMessage(error, fallback = 'Something went wrong') {
  if (!error) return fallback;

  const payload = getPayload(error);
  const info = getErrorInfo(error);

  if ((error.message === 'Network Error' || !error.response) && !payload) {
    return NETWORK_ERROR_MESSAGE;
  }

  const code = getApiErrorCode(error);
  const serverMessage =
    info?.message ||
    payload?.error ||
    payload?.message ||
    error.normalizedMessage;

  if (serverMessage) return serverMessage;
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  if (error.response?.status === 403) return 'You do not have access to this action.';
  if (error.response?.status >= 500) return 'Server error. Please try again or contact support.';

  return error.message || fallback;
}

export function normalizeApiError(error, fallback) {
  const info = getErrorInfo(error);
  const message = getApiErrorMessage(error, fallback);
  const isNetworkFallback = message === NETWORK_ERROR_MESSAGE && !getPayload(error);

  return {
    message,
    code: isNetworkFallback ? '' : getApiErrorCode(error),
    details: getApiErrorDetails(error),
    requestId: getApiRequestId(error),
    status: info?.status || error?.response?.status || error?.status,
  };
}

export function getApiErrorToastId(normalized) {
  if (!normalized) return undefined;

  if (
    !normalized.code &&
    !normalized.requestId &&
    !normalized.status &&
    normalized.message === NETWORK_ERROR_MESSAGE
  ) {
    return 'api-error:network';
  }

  return undefined;
}

function stringifyDetailValue(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatApiErrorDetail(detail) {
  if (!detail) return '';
  if (typeof detail === 'string') return detail;
  const field = detail.field || detail.param || detail.path || detail.provider || detail.scope || '';
  const message = detail.message || detail.error || detail.reason || '';
  const providerCode = detail.providerCode || detail.providerSubcode
    ? [detail.providerCode, detail.providerSubcode].filter(Boolean).join('/')
    : '';
  const extra = Object.entries(detail)
    .filter(([key]) => !['field', 'param', 'path', 'provider', 'scope', 'message', 'error', 'reason', 'providerCode', 'providerSubcode'].includes(key))
    .map(([key, value]) => `${key}: ${stringifyDetailValue(value)}`)
    .filter(Boolean)
    .join(', ');

  return [field, providerCode, message, extra].filter(Boolean).join(' - ');
}

export function showApiError(error, fallback) {
  const normalized = normalizeApiError(error, fallback);
  const metadata = [
    normalized.code ? `Code: ${normalized.code}` : '',
    normalized.requestId ? `Request: ${normalized.requestId}` : '',
  ].filter(Boolean).join(' | ');
  const detail = normalized.details?.length ? `\n${formatApiErrorDetail(normalized.details[0])}` : '';
  const suffix = metadata ? `\n${metadata}` : '';
  toast.error(`${normalized.message}${suffix}${detail}`, {
    duration: 6000,
    id: getApiErrorToastId(normalized),
  });
  return normalized;
}
