const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
const MAX_UPLOAD_BYTES = 35 * 1024 * 1024;
const DEFAULT_PUBLIC_API_BASE_URL = 'https://api.whatsapp.finlectechnologies.com';

const UPLOAD_TYPE_DEFINITIONS = [
  { kind: 'image', extension: '.jpg', mimeTypes: ['image/jpeg'] },
  { kind: 'image', extension: '.jpeg', mimeTypes: ['image/jpeg'] },
  { kind: 'image', extension: '.png', mimeTypes: ['image/png'] },
  { kind: 'image', extension: '.gif', mimeTypes: ['image/gif'] },
  { kind: 'image', extension: '.webp', mimeTypes: ['image/webp'] },
  { kind: 'image', extension: '.bmp', mimeTypes: ['image/bmp'] },
  { kind: 'video', extension: '.mp4', mimeTypes: ['video/mp4'] },
  { kind: 'video', extension: '.mov', mimeTypes: ['video/quicktime'] },
  { kind: 'video', extension: '.avi', mimeTypes: ['video/x-msvideo', 'video/avi'] },
  { kind: 'video', extension: '.mkv', mimeTypes: ['video/x-matroska', 'video/mkv'] },
  { kind: 'video', extension: '.webm', mimeTypes: ['video/webm'] },
  { kind: 'document', extension: '.pdf', mimeTypes: ['application/pdf'] },
  { kind: 'document', extension: '.doc', mimeTypes: ['application/msword'] },
  { kind: 'document', extension: '.docx', mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  { kind: 'document', extension: '.xls', mimeTypes: ['application/vnd.ms-excel'] },
  { kind: 'document', extension: '.xlsx', mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] },
  { kind: 'document', extension: '.ppt', mimeTypes: ['application/vnd.ms-powerpoint'] },
  { kind: 'document', extension: '.pptx', mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'] },
  { kind: 'document', extension: '.txt', mimeTypes: ['text/plain'] },
  { kind: 'document', extension: '.csv', mimeTypes: ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'] },
];

const UPLOAD_TYPE_BY_EXTENSION = new Map(
  UPLOAD_TYPE_DEFINITIONS.map((definition) => [definition.extension, definition])
);

const LEGACY_UPLOAD_ALIASES = {
  'WhatsApp-Image-2026-04-17-at-5-56-39-PM-1776774238210.jpeg': 'itroots-flow-data-analytics.jpeg',
};

const LEGACY_UPLOAD_ALIAS_PATTERNS = [
  {
    pattern: /^628198102_26851699957852921_8364174062947143509_n(?:-\d{10,})?\.jpe?g$/i,
    target: 'itroots-flow-welcome.jpeg',
  },
  {
    pattern: /^WhatsApp-Image-2026-04-17-at-5-56-40-PM-\d{10,}\.jpeg$/i,
    target: 'itroots-flow-offer-sdlc.jpeg',
  },
];

const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const PDF_SIGNATURE = Buffer.from('%PDF-');

function bufferStartsWith(buffer, signature) {
  return Buffer.isBuffer(buffer)
    && Buffer.isBuffer(signature)
    && buffer.length >= signature.length
    && buffer.subarray(0, signature.length).equals(signature);
}

function looksLikeUtf8Text(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;

  const sample = buffer.subarray(0, Math.min(buffer.length, 2048));
  let printable = 0;

  for (const byte of sample) {
    if (byte === 0x00) return false;
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e) || byte >= 0x80) {
      printable += 1;
    }
  }

  return printable / sample.length >= 0.95;
}

function validateUploadBuffer(buffer, { extension = '', kind = '', mimeType = '' } = {}) {
  const ext = String(extension || '').toLowerCase();
  const type = String(kind || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;

  if (type === 'image') {
    if (ext === '.jpg' || ext === '.jpeg') return bufferStartsWith(buffer, Buffer.from([0xff, 0xd8, 0xff]));
    if (ext === '.png') return bufferStartsWith(buffer, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    if (ext === '.gif') return bufferStartsWith(buffer, Buffer.from('GIF8'));
    if (ext === '.webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    if (ext === '.bmp') return bufferStartsWith(buffer, Buffer.from('BM'));
    return false;
  }

  if (type === 'video') {
    if (ext === '.mp4' || ext === '.mov') return buffer.length > 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    if (ext === '.avi') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'AVI ';
    if (ext === '.webm' || ext === '.mkv') return bufferStartsWith(buffer, Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    return false;
  }

  if (type === 'document') {
    if (ext === '.pdf') return bufferStartsWith(buffer, PDF_SIGNATURE);
    if (ext === '.doc' || ext === '.xls' || ext === '.ppt') return bufferStartsWith(buffer, OLE_SIGNATURE);
    if (ext === '.docx' || ext === '.xlsx' || ext === '.pptx') return bufferStartsWith(buffer, ZIP_SIGNATURE);
    if (ext === '.txt' || ext === '.csv' || mime === 'text/plain' || mime === 'text/csv') return looksLikeUtf8Text(buffer);
    return false;
  }

  return false;
}

function getLegacyUploadAliasTarget(requestedName = '') {
  const patternMatch = LEGACY_UPLOAD_ALIAS_PATTERNS.find(({ pattern }) => pattern.test(requestedName));
  return patternMatch?.target || '';
}

function getExactLegacyUploadAliasTarget(requestedName = '') {
  return LEGACY_UPLOAD_ALIASES[requestedName] || '';
}

function getTimestampedUploadParts(filename = '') {
  const safeName = path.posix.basename(String(filename || ''));
  const extension = path.extname(safeName).toLowerCase();
  if (!UPLOAD_TYPE_BY_EXTENSION.has(extension)) return null;

  const nameWithoutExtension = safeName.slice(0, -extension.length);
  const match = nameWithoutExtension.match(/^(.+)-(\d{10,})$/);
  if (!match) return null;

  return {
    baseName: match[1],
    extension,
    timestamp: Number(match[2]),
  };
}

function getUploadAliasLookupParts(filename = '') {
  const timestampedParts = getTimestampedUploadParts(filename);
  if (timestampedParts) return timestampedParts;

  const safeName = path.posix.basename(String(filename || ''));
  const extension = path.extname(safeName).toLowerCase();
  if (!UPLOAD_TYPE_BY_EXTENSION.has(extension)) return null;

  const baseName = safeName.slice(0, -extension.length);
  if (!baseName) return null;

  return {
    baseName,
    extension,
    timestamp: 0,
  };
}

function normalizeTimestampAliasBaseName(baseName = '') {
  return String(baseName || '').replace(/-\d+$/, '');
}

function normalizePublicBaseUrl(value = '') {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  try {
    const parsedUrl = new URL(rawValue);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return '';
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');
    parsedUrl.search = '';
    parsedUrl.hash = '';
    return parsedUrl.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function getPublicApiBaseUrl() {
  return (
    normalizePublicBaseUrl(process.env.PUBLIC_API_BASE_URL) ||
    normalizePublicBaseUrl(DEFAULT_PUBLIC_API_BASE_URL)
  );
}

function normalizeUploadPath(uploadReference = '') {
  const rawReference = String(uploadReference || '').trim();
  if (!rawReference) return '';
  if (rawReference.startsWith('/uploads/')) return rawReference;
  if (rawReference.startsWith('uploads/')) return `/${rawReference}`;

  if (/^https?:\/\//i.test(rawReference)) {
    try {
      const parsedUrl = new URL(rawReference);
      if (parsedUrl.pathname.startsWith('/uploads/')) {
        return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
      }
    } catch {
      return '';
    }
  }

  return '';
}

function buildPublicUploadUrl(uploadReference = '') {
  const rawReference = String(uploadReference || '').trim();
  if (!rawReference) return '';

  if (/^https?:\/\//i.test(rawReference)) {
    try {
      const parsedUrl = new URL(rawReference);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) return '';
      if (parsedUrl.pathname.startsWith('/uploads/')) {
        const publicBaseUrl = getPublicApiBaseUrl();
        return publicBaseUrl
          ? `${publicBaseUrl}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`
          : parsedUrl.toString();
      }
      return parsedUrl.toString();
    } catch {
      return '';
    }
  }

  const normalizedPath = normalizeUploadPath(rawReference);
  if (!normalizedPath) return '';

  const publicBaseUrl = getPublicApiBaseUrl();
  return publicBaseUrl ? `${publicBaseUrl}${normalizedPath}` : '';
}

function buildLegacyUploadRedirectPath(filename = '') {
  const safeFilename = String(filename || '').trim();
  return `/uploads/${encodeURIComponent(safeFilename)}`;
}

function getUploadDefinition(filename = '', mimeType = '') {
  const extension = path.extname(String(filename || '')).toLowerCase();
  const definition = UPLOAD_TYPE_BY_EXTENSION.get(extension);
  if (!definition) return null;

  const normalizedMimeType = String(mimeType || '').trim().toLowerCase();
  const mimeAllowed = !normalizedMimeType
    || normalizedMimeType === 'application/octet-stream'
    || definition.mimeTypes.includes(normalizedMimeType);

  if (!mimeAllowed) return null;

  return {
    kind: definition.kind,
    extension: definition.extension,
    mimeType: definition.mimeTypes.includes(normalizedMimeType)
      ? normalizedMimeType
      : definition.mimeTypes[0],
  };
}

function sanitizeStoredFilename(filename = 'file', extension = '') {
  const base = path.basename(String(filename || 'file'), path.extname(String(filename || '')))
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'file';

  return `${base}-${Date.now()}${extension}`;
}

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function getAllowedUploadHosts(requestHost = '') {
  const hosts = new Set();

  const maybeAddHost = (value = '') => {
    const text = String(value || '').trim();
    if (!text) return;

    try {
      const parsed = new URL(text);
      if (parsed.host) hosts.add(parsed.host.toLowerCase());
      return;
    } catch {
      if (/^[a-z0-9.-]+(?::\d+)?$/i.test(text)) {
        hosts.add(text.toLowerCase());
      }
    }
  };

  maybeAddHost(requestHost);
  maybeAddHost(process.env.PUBLIC_API_BASE_URL);

  return hosts;
}

function resolveStoredUpload(uploadReference, { requestHost } = {}) {
  const rawReference = String(uploadReference || '').trim();
  if (!rawReference) return null;

  let pathname = rawReference;
  if (/^https?:\/\//i.test(rawReference)) {
    let parsedUrl;
    try {
      parsedUrl = new URL(rawReference);
    } catch {
      return null;
    }

    const allowedHosts = getAllowedUploadHosts(requestHost);
    if (!allowedHosts.has(String(parsedUrl.host || '').toLowerCase())) {
      return null;
    }

    pathname = parsedUrl.pathname;
  }

  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (!decodedPathname.startsWith('/uploads/')) {
    return null;
  }

  const storedName = path.posix.basename(decodedPathname);
  if (decodedPathname !== `/uploads/${storedName}`) {
    return null;
  }

  const definition = getUploadDefinition(storedName);
  if (!definition) return null;

  const absolutePath = path.join(UPLOAD_DIR, storedName);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return null;
  }

  return {
    storedName,
    absolutePath,
    relativePath: `/uploads/${storedName}`,
    kind: definition.kind,
    mimeType: definition.mimeType,
  };
}

function resolveLocalStoredUpload(uploadReference, options = {}) {
  const directMatch = resolveStoredUpload(uploadReference, options);
  if (directMatch) return directMatch;

  const rawReference = String(uploadReference || '').trim();
  if (!/^https?:\/\//i.test(rawReference)) return null;

  try {
    const parsedUrl = new URL(rawReference);
    if (!parsedUrl.pathname.startsWith('/uploads/')) return null;
    return resolveStoredUpload(parsedUrl.pathname);
  } catch {
    return null;
  }
}

function resolveUploadAlias(uploadReference) {
  const rawReference = String(uploadReference || '').trim();
  if (!rawReference) return null;

  let pathname = rawReference;
  if (/^https?:\/\//i.test(rawReference)) {
    try {
      pathname = new URL(rawReference).pathname;
    } catch {
      return null;
    }
  }

  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const requestedName = path.posix.basename(decodedPathname);
  if (!requestedName) return null;
  if (decodedPathname !== requestedName && !decodedPathname.endsWith(`/${requestedName}`)) return null;

  const exactAliasedName = getExactLegacyUploadAliasTarget(requestedName);
  if (exactAliasedName) {
    const resolved = resolveStoredUpload(`/uploads/${exactAliasedName}`);
    if (resolved) return resolved;
  }

  const timestampedAlias = resolveTimestampedUploadAlias(requestedName);
  if (timestampedAlias) return timestampedAlias;

  const aliasedName = getLegacyUploadAliasTarget(requestedName);
  if (!aliasedName) return null;

  return resolveStoredUpload(`/uploads/${aliasedName}`);
}

function resolveTimestampedUploadAlias(requestedName) {
  const requestedParts = getUploadAliasLookupParts(requestedName);
  if (!requestedParts || !fs.existsSync(UPLOAD_DIR)) return null;

  const timestampedEntries = fs.readdirSync(UPLOAD_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const parts = getTimestampedUploadParts(entry.name);
      return parts ? { name: entry.name, ...parts } : null;
    });

  const candidates = timestampedEntries
    .filter((entry) =>
      entry &&
      entry.name !== requestedName &&
      entry.baseName === requestedParts.baseName &&
      entry.extension === requestedParts.extension
    )
    .sort((a, b) => b.timestamp - a.timestamp);

  for (const candidate of candidates) {
    const resolved = resolveStoredUpload(`/uploads/${candidate.name}`);
    if (resolved) return resolved;
  }

  const normalizedRequestedBaseName = normalizeTimestampAliasBaseName(requestedParts.baseName);
  if (normalizedRequestedBaseName) {
    const normalizedCandidates = timestampedEntries
      .filter((entry) =>
        entry &&
        entry.name !== requestedName &&
        entry.extension === requestedParts.extension &&
        normalizeTimestampAliasBaseName(entry.baseName) === normalizedRequestedBaseName
      )
      .sort((a, b) => b.timestamp - a.timestamp);

    for (const candidate of normalizedCandidates) {
      const resolved = resolveStoredUpload(`/uploads/${candidate.name}`);
      if (resolved) return resolved;
    }
  }

  return null;
}

module.exports = {
  MAX_UPLOAD_BYTES,
  UPLOAD_DIR,
  buildLegacyUploadRedirectPath,
  buildPublicUploadUrl,
  ensureUploadDir,
  getUploadDefinition,
  resolveLocalStoredUpload,
  resolveUploadAlias,
  resolveStoredUpload,
  sanitizeStoredFilename,
  validateUploadBuffer,
  __test__: {
    buildPublicUploadUrl,
    buildLegacyUploadRedirectPath,
    looksLikeUtf8Text,
    getTimestampedUploadParts,
    normalizePublicBaseUrl,
    normalizeTimestampAliasBaseName,
  },
};
