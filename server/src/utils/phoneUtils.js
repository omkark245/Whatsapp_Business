/**
 * Shared phone-number normalization utilities.
 *
 * These helpers are used by both the CSV import controller and the
 * WhatsApp webhook handler so that the same deduplication logic applies
 * to both code paths.
 */

/**
 * Strip every non-digit character from a phone value.
 * @param {string|number} value
 * @returns {string}
 */
function digitsOnly(value = '') {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Return the canonical form of a phone number for within-file
 * deduplication: always the last 10 digits (or the full string if
 * shorter than 10).
 * @param {string} digits
 * @returns {string}
 */
function canonicalPhone(digits) {
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Validate whether a digit-only phone string is a valid Indian mobile
 * number.
 *
 * Accepted formats:
 * - 10 digits starting with 6-9       e.g. 9876543210
 * - 11 digits with leading 0          e.g. 09876543210
 * - 12 digits with 91 country code    e.g. 919876543210
 * - 13 digits with 091 prefix         e.g. 0919876543210
 *
 * @param {string} digits
 * @returns {{ valid: boolean, reason?: string }}
 */
function isValidIndianPhone(digits) {
  if (!digits) {
    return { valid: false, reason: 'Phone number is empty' };
  }

  let normalized = digits;
  if (normalized.length === 13 && normalized.startsWith('091')) {
    normalized = normalized.slice(1);
  }
  if (normalized.length === 11 && normalized.startsWith('0')) {
    normalized = normalized.slice(1);
  }

  if (normalized.length === 10) {
    return /^[6-9]/.test(normalized)
      ? { valid: true }
      : { valid: false, reason: 'Indian mobile numbers must start with 6, 7, 8, or 9' };
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return /^[6-9]/.test(digits.slice(1))
      ? { valid: true }
      : { valid: false, reason: 'Indian mobile numbers must start with 6, 7, 8, or 9 after leading 0' };
  }

  if (normalized.length === 12 && normalized.startsWith('91')) {
    const local = normalized.slice(2);
    return /^[6-9]/.test(local)
      ? { valid: true }
      : { valid: false, reason: 'Indian mobile numbers must start with 6, 7, 8, or 9 after country code' };
  }

  if (normalized.length < 10) {
    return { valid: false, reason: 'Phone number is too short (need 10 digits)' };
  }
  if (normalized.length === 11) {
    return { valid: false, reason: 'Phone number has 11 digits - use 0 + 10 digits or 91 + 10 digits' };
  }
  if (normalized.length > 12) {
    return { valid: false, reason: 'Phone number is too long (max 12 digits with country code)' };
  }

  return { valid: false, reason: 'Invalid Indian phone number format' };
}

/**
 * Normalize a digit-only Indian phone number to the WhatsApp-expected
 * 12-digit format: 91XXXXXXXXXX.
 *
 * @param {string} digits
 * @returns {string}
 */
function normalizeIndianPhone(digits) {
  if (!digits) return digits;

  let d = digits;
  if (d.length === 13 && d.startsWith('091')) {
    d = d.slice(1);
  }
  if (d.length === 11 && d.startsWith('0') && /^[6-9]/.test(d.slice(1))) {
    d = d.slice(1);
  }

  if (d.length === 10 && /^[6-9]/.test(d)) {
    return `91${d}`;
  }

  if (d.length === 12 && d.startsWith('91') && /^[6-9]/.test(d.slice(2))) {
    return d;
  }

  return digits;
}

/**
 * Normalize an Indian phone number to the 10-digit local mobile format used
 * for display and contact list storage inside the app.
 *
 * @param {string} digits
 * @returns {string}
 */
function normalizeIndianDisplayPhone(digits) {
  if (!digits) return digits;

  let d = digits;
  if (d.length === 13 && d.startsWith('091')) {
    d = d.slice(1);
  }
  if (d.length === 11 && d.startsWith('0') && /^[6-9]/.test(d.slice(1))) {
    d = d.slice(1);
  }

  if (d.length === 12 && d.startsWith('91') && /^[6-9]/.test(d.slice(2))) {
    return d.slice(2);
  }

  if (d.length === 10 && /^[6-9]/.test(d)) {
    return d;
  }

  return canonicalPhone(d);
}

/**
 * Build a set of lookup variants for a phone number so that
 * 9876543210, 09876543210, 919876543210, and +91 98765 43210 all resolve
 * to the same contact.
 *
 * @param {string} value
 * @returns {string[]}
 */
function phoneVariants(value = '') {
  const digits = digitsOnly(value);
  const variants = new Set();
  const local = normalizeIndianDisplayPhone(digits);
  const waId = normalizeIndianPhone(digits);

  if (digits) variants.add(digits);
  if (local) variants.add(local);
  if (waId) variants.add(waId);
  if (digits.length > 10) variants.add(digits.slice(-10));
  if (digits.length === 10) variants.add(`91${digits}`);

  return [...variants];
}

module.exports = {
  digitsOnly,
  canonicalPhone,
  phoneVariants,
  isValidIndianPhone,
  normalizeIndianPhone,
  normalizeIndianDisplayPhone,
};
