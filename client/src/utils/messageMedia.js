const MEDIA_KINDS = new Set(['image', 'video', 'document']);
const LEGACY_MEDIA_FILENAME_ALIASES = [
  {
    pattern: /^628198102_26851699957852921_8364174062947143509_n(?:-\d{10,})?\.jpe?g$/i,
    target: '/uploads/itroots-flow-welcome.jpeg',
  },
];

function isMetaSampleMediaReference(value = '') {
  const text = String(value || '').trim();
  if (!/^https?:\/\//i.test(text)) return false;

  try {
    const parsedUrl = new URL(text);
    const host = String(parsedUrl.hostname || '').toLowerCase();
    return host === 'scontent.whatsapp.net' || host === 'lookaside.fbsbx.com';
  } catch {
    return false;
  }
}

function normalizeManagedUploadPath(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';

  const normalizePath = (pathname = '', search = '', hash = '') => {
    if (pathname.startsWith('/api/uploads/')) {
      return `/uploads/${pathname.slice('/api/uploads/'.length)}${search}${hash}`;
    }
    if (pathname.startsWith('/uploads/')) {
      return `${pathname}${search}${hash}`;
    }
    return '';
  };

  if (text.startsWith('/api/uploads/') || text.startsWith('/uploads/')) {
    return normalizePath(text);
  }

  try {
    const parsedUrl = new URL(text, 'http://preview.local');
    return normalizePath(parsedUrl.pathname, parsedUrl.search, parsedUrl.hash);
  } catch {
    return '';
  }
}

function getFilenameUploadPath(filename = '') {
  const basename = String(filename || '')
    .trim()
    .split(/[\\/]/)
    .pop();

  if (!basename || basename.includes('?') || basename.includes('#')) return '';
  if (!/\.[a-z0-9]{2,8}$/i.test(basename)) return '';
  return `/uploads/${basename}`;
}

function getLegacyMediaAliasPath(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';

  let basename = text.split(/[\\/]/).pop() || '';
  if (/^https?:\/\//i.test(text) || text.startsWith('/')) {
    try {
      const parsedUrl = new URL(text, 'http://preview.local');
      basename = parsedUrl.pathname.split('/').pop() || basename;
    } catch {
      // Fall back to the simple basename parsed above.
    }
  }

  const cleanBasename = basename.split('?')[0].split('#')[0];
  const alias = LEGACY_MEDIA_FILENAME_ALIASES.find(({ pattern }) => pattern.test(cleanBasename));
  return alias?.target || '';
}

export function getUploadAssetUrl(uploadPath, { apiBaseUrl = '/api', origin = 'http://localhost' } = {}) {
  const normalizedPath = normalizeManagedUploadPath(uploadPath)
    || (String(uploadPath || '').startsWith('/') ? uploadPath : `/${uploadPath}`);

  try {
    const parsedApiUrl = new URL(apiBaseUrl, origin);
    const assetBasePath = parsedApiUrl.pathname.replace(/\/api\/?$/, '');
    return new URL(normalizedPath, `${parsedApiUrl.origin}${assetBasePath || ''}/`).href;
  } catch {
    return normalizedPath;
  }
}

export function resolveMediaAssetUrl(value, { apiBaseUrl = '/api', origin = 'http://localhost' } = {}) {
  const text = String(value || '').trim();
  if (!text) return '';

  const normalizedUploadPath = normalizeManagedUploadPath(text);
  if (normalizedUploadPath) {
    return getUploadAssetUrl(normalizedUploadPath, { apiBaseUrl, origin });
  }

  try {
    const parsedUrl = new URL(text, origin);
    return parsedUrl.href;
  } catch {
    return text;
  }
}

function getCandidateMediaUrls(values = [], { apiBaseUrl = '/api', origin = 'http://localhost' } = {}) {
  const seen = new Set();
  const candidates = [];
  const deferredMetaSamples = [];

  const addCandidate = (value) => {
    const text = String(value || '').trim();
    if (!text) return;

    const legacyAliasPath = getLegacyMediaAliasPath(text);
    if (legacyAliasPath) {
      const aliasUrl = resolveMediaAssetUrl(legacyAliasPath, { apiBaseUrl, origin });
      if (aliasUrl && !seen.has(aliasUrl)) {
        seen.add(aliasUrl);
        candidates.push(aliasUrl);
      }
    }

    if (isMetaSampleMediaReference(text)) {
      if (legacyAliasPath) {
        if (!seen.has(text)) {
          seen.add(text);
          candidates.push(text);
        }
      } else if (!seen.has(text)) {
        deferredMetaSamples.push(text);
      }
      return;
    }

    const resolvedUrl = resolveMediaAssetUrl(text, { apiBaseUrl, origin });
    if (resolvedUrl && !seen.has(resolvedUrl)) {
      seen.add(resolvedUrl);
      candidates.push(resolvedUrl);
    }

    if (/^https?:\/\//i.test(text) && !seen.has(text)) {
      seen.add(text);
      candidates.push(text);
    }
  };

  values.forEach(addCandidate);
  if (candidates.length === 0) {
    deferredMetaSamples.forEach((sampleUrl) => {
      if (!seen.has(sampleUrl)) {
        seen.add(sampleUrl);
        candidates.push(sampleUrl);
      }
    });
  }
  return candidates;
}

function getTemplateComponentMediaValues(message) {
  const components = Array.isArray(message?.metadata?.components) ? message.metadata.components : [];
  const mediaValues = [];

  for (const component of components) {
    if (String(component?.type || '').trim().toLowerCase() !== 'header') continue;
    const parameters = Array.isArray(component?.parameters) ? component.parameters : [];

    for (const parameter of parameters) {
      const kind = String(parameter?.type || '').trim().toLowerCase();
      if (!MEDIA_KINDS.has(kind)) continue;

      const mediaLink = String(parameter?.[kind]?.link || parameter?.link || '').trim();
      if (mediaLink) mediaValues.push(mediaLink);
    }
  }

  return mediaValues;
}

export function getMessageMediaSpec(message, { apiBaseUrl = '/api', origin = 'http://localhost' } = {}) {
  const messageType = String(message?.type || '').trim().toLowerCase();
  if (MEDIA_KINDS.has(messageType)) {
    const filenameUploadPath = ['image', 'video'].includes(messageType)
      ? getFilenameUploadPath(message?.metadata?.mediaFilename)
      : '';
    const candidateUrls = getCandidateMediaUrls([
      message?.mediaUrl,
      message?.metadata?.mediaUrl,
      filenameUploadPath,
    ], { apiBaseUrl, origin });
    const mediaUrl = candidateUrls[0] || '';
    if (!mediaUrl) return null;

    return {
      kind: messageType,
      mediaUrl,
      candidateUrls,
      label: message?.metadata?.mediaFilename || message?.content || 'Open document',
    };
  }

  const templateKind = String(message?.metadata?.templateMedia?.kind || '').trim().toLowerCase();
  const componentMediaValues = getTemplateComponentMediaValues(message);
  const componentKind = String(
    componentMediaValues.length > 0
      ? message?.metadata?.components?.find((component) => String(component?.type || '').trim().toLowerCase() === 'header')
        ?.parameters?.find((parameter) => MEDIA_KINDS.has(String(parameter?.type || '').trim().toLowerCase()))
        ?.type
      : ''
  ).trim().toLowerCase();
  const resolvedTemplateKind = MEDIA_KINDS.has(templateKind) ? templateKind : componentKind;

  if (MEDIA_KINDS.has(resolvedTemplateKind)) {
    const templateMediaUrl = message?.metadata?.templateMedia?.mediaUrl;
    const templateMediaHasLegacyAlias = getLegacyMediaAliasPath(templateMediaUrl);
    const filenameUploadPath = ['image', 'video'].includes(resolvedTemplateKind)
      ? (templateMediaHasLegacyAlias ? '' : getFilenameUploadPath(message?.metadata?.templateMedia?.filename))
      : '';
    const candidateUrls = getCandidateMediaUrls([
      message?.metadata?.templateMedia?.mediaUrl,
      message?.mediaUrl,
      ...componentMediaValues,
      filenameUploadPath,
    ], { apiBaseUrl, origin });
    const mediaUrl = candidateUrls[0] || '';
    if (!mediaUrl) return null;

    return {
      kind: resolvedTemplateKind,
      mediaUrl,
      candidateUrls,
      label: message?.metadata?.templateMedia?.filename || message?.content || 'Open document',
    };
  }

  return null;
}
