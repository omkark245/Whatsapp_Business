const path = require('path');
const { resolveLocalStoredUpload } = require('./uploads');

const TEMPLATE_MEDIA_TYPES = new Set(['image', 'video', 'document']);

function normalizeTemplateMediaKind(kind = '') {
  const normalized = String(kind || '').trim().toLowerCase();
  return TEMPLATE_MEDIA_TYPES.has(normalized) ? normalized : '';
}

function getTemplateHeaderMediaReference(template, variablesMapping) {
  return String(variablesMapping?.headerMediaUrl || template?.headerContent || '').trim();
}

function looksLikeHttpUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function isMetaSampleMediaReference(value = '') {
  const text = String(value || '').trim();
  if (!looksLikeHttpUrl(text)) return false;

  try {
    const parsedUrl = new URL(text);
    const host = String(parsedUrl.hostname || '').toLowerCase();
    return host === 'scontent.whatsapp.net' || host === 'lookaside.fbsbx.com';
  } catch {
    return false;
  }
}

function isPreviewableTemplateMediaUrl(value = '') {
  const text = String(value || '').trim();
  if (isMetaSampleMediaReference(text)) return false;
  return text.startsWith('/uploads/')
    || text.startsWith('uploads/')
    || looksLikeHttpUrl(text);
}

function getFallbackTemplateMediaLabel(kind = '') {
  if (kind === 'image') return 'Image Header';
  if (kind === 'video') return 'Video Header';
  if (kind === 'document') return 'Document Header';
  return 'Template Header';
}

function getTemplateMediaFilename(mediaUrl = '', kind = '') {
  const text = String(mediaUrl || '').trim();
  if (!text) return getFallbackTemplateMediaLabel(kind);

  try {
    const parsedUrl = new URL(text, 'https://preview.local');
    const filename = path.posix.basename(parsedUrl.pathname);
    if (filename) return decodeURIComponent(filename);
  } catch {
    return getFallbackTemplateMediaLabel(kind);
  }

  return getFallbackTemplateMediaLabel(kind);
}

function buildTemplateMediaPreview(template, variablesMapping = {}, headerMediaParameter = null) {
  const kind = normalizeTemplateMediaKind(template?.headerType);
  if (!kind) return null;

  const fallbackMediaUrl = getTemplateHeaderMediaReference(template, variablesMapping);
  const linkedHeaderMediaUrl = String(
    headerMediaParameter?.[kind]?.link
    || headerMediaParameter?.link
    || ''
  ).trim();
  const storedUpload = resolveLocalStoredUpload(linkedHeaderMediaUrl || fallbackMediaUrl);
  const mediaUrl = storedUpload?.relativePath || [linkedHeaderMediaUrl, fallbackMediaUrl].find(isPreviewableTemplateMediaUrl) || '';

  if (!mediaUrl) return null;

  return {
    kind,
    mediaUrl,
    filename: getTemplateMediaFilename(mediaUrl, kind),
  };
}

function buildTemplateMediaPreviewFromComponents(components = [], fallbackMediaUrl = '') {
  const headerComponent = Array.isArray(components)
    ? components.find((component) => String(component?.type || '').toLowerCase() === 'header')
    : null;
  const headerParameter = headerComponent?.parameters?.[0] || null;
  const kind = normalizeTemplateMediaKind(headerParameter?.type);
  if (!kind) return null;

  const linkedHeaderMediaUrl = String(headerParameter?.[kind]?.link || '').trim();
  const storedUpload = resolveLocalStoredUpload(fallbackMediaUrl || linkedHeaderMediaUrl);
  const mediaUrl = storedUpload?.relativePath || [linkedHeaderMediaUrl, String(fallbackMediaUrl || '').trim()].find(isPreviewableTemplateMediaUrl) || '';

  if (!mediaUrl) return null;

  return {
    kind,
    mediaUrl,
    filename: getTemplateMediaFilename(mediaUrl, kind),
  };
}

function buildTemplateDisplayText(template, renderedBody = '') {
  const sections = [];
  const bodyText = String(renderedBody || '').trim();
  const footerText = String(template?.footer || '').trim();
  const buttons = Array.isArray(template?.buttons)
    ? template.buttons
      .map((button) => String(button?.text || '').trim())
      .filter(Boolean)
    : [];

  if (bodyText) sections.push(bodyText);
  if (footerText) sections.push(footerText);
  if (buttons.length > 0) {
    sections.push(`Buttons:\n${buttons.map((label) => `- ${label}`).join('\n')}`);
  }

  return sections.join('\n\n').trim() || String(template?.name || '').trim();
}

module.exports = {
  buildTemplateDisplayText,
  buildTemplateMediaPreview,
  buildTemplateMediaPreviewFromComponents,
  __test__: {
    getTemplateHeaderMediaReference,
    getTemplateMediaFilename,
    isMetaSampleMediaReference,
    isPreviewableTemplateMediaUrl,
    normalizeTemplateMediaKind,
  },
};
