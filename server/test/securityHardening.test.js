const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const setupWebhook = require('../src/webhooks/whatsappWebhook');
const {
  UPLOAD_DIR,
  buildLegacyUploadRedirectPath,
  buildPublicUploadUrl,
  getUploadDefinition,
  resolveLocalStoredUpload,
  resolveUploadAlias,
  resolveStoredUpload,
  validateUploadBuffer,
} = require('../src/utils/uploads');
const { validateRuntimeConfig } = require('../src/utils/runtimeConfig');

function restoreEnvValue(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test('getUploadDefinition accepts safe media and rejects svg/html uploads', () => {
  assert.deepEqual(getUploadDefinition('photo.png', 'image/png'), {
    kind: 'image',
    extension: '.png',
    mimeType: 'image/png',
  });
  assert.equal(getUploadDefinition('vector.svg', 'image/svg+xml'), null);
  assert.equal(getUploadDefinition('poc.html', 'text/html'), null);
});

test('validateUploadBuffer rejects mismatched file content', () => {
  assert.equal(
    validateUploadBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
      extension: '.png',
      kind: 'image',
      mimeType: 'image/png',
    }),
    true
  );

  assert.equal(
    validateUploadBuffer(Buffer.from('<html>not a png</html>'), {
      extension: '.png',
      kind: 'image',
      mimeType: 'image/png',
    }),
    false
  );
});

test('resolveStoredUpload accepts local uploads and rejects external hosts', () => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const storedName = 'security-hardening-test.png';
  const absolutePath = path.join(UPLOAD_DIR, storedName);

  fs.writeFileSync(absolutePath, Buffer.from('png'));

  try {
    const resolved = resolveStoredUpload(`/uploads/${storedName}`, { requestHost: 'localhost:5001' });
    assert.equal(resolved?.storedName, storedName);
    assert.equal(resolved?.mimeType, 'image/png');

    const external = resolveStoredUpload(`https://attacker.example/uploads/${storedName}`, { requestHost: 'localhost:5001' });
    assert.equal(external, null);
  } finally {
    fs.unlinkSync(absolutePath);
  }
});

test('resolveLocalStoredUpload recovers upload URLs for send-time media upload', () => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const storedName = 'send-time-local-upload.png';
  const absolutePath = path.join(UPLOAD_DIR, storedName);

  fs.writeFileSync(absolutePath, Buffer.from('png'));

  try {
    const strictResolved = resolveStoredUpload(`https://old-api.example.com/uploads/${storedName}`, {
      requestHost: 'current-api.example.com',
    });
    assert.equal(strictResolved, null);

    const sendResolved = resolveLocalStoredUpload(`https://old-api.example.com/uploads/${storedName}`, {
      requestHost: 'current-api.example.com',
    });
    assert.equal(sendResolved?.storedName, storedName);
    assert.equal(sendResolved?.relativePath, `/uploads/${storedName}`);
  } finally {
    fs.unlinkSync(absolutePath);
  }
});

test('buildPublicUploadUrl normalizes stored uploads to the public API host', () => {
  const previousBaseUrl = process.env.PUBLIC_API_BASE_URL;
  process.env.PUBLIC_API_BASE_URL = 'https://api.example.com/';

  try {
    assert.equal(
      buildPublicUploadUrl('/uploads/welcome-banner.png'),
      'https://api.example.com/uploads/welcome-banner.png'
    );
    assert.equal(
      buildPublicUploadUrl('uploads/welcome-banner.png'),
      'https://api.example.com/uploads/welcome-banner.png'
    );
    assert.equal(
      buildPublicUploadUrl('https://whatsapp.finlectechnologies.com/uploads/welcome-banner.png'),
      'https://api.example.com/uploads/welcome-banner.png'
    );
  } finally {
    restoreEnvValue('PUBLIC_API_BASE_URL', previousBaseUrl);
  }
});

test('buildLegacyUploadRedirectPath maps legacy api upload requests to the public upload route', () => {
  assert.equal(
    buildLegacyUploadRedirectPath('welcome banner.png'),
    '/uploads/welcome%20banner.png'
  );
  assert.equal(
    buildLegacyUploadRedirectPath(''),
    '/uploads/'
  );
});

test('resolveUploadAlias maps legacy flow upload names to stable assets', () => {
  const resolved = resolveUploadAlias('/uploads/WhatsApp-Image-2026-04-17-at-5-56-39-PM-1776774238210.jpeg');
  const bareResolved = resolveUploadAlias('WhatsApp-Image-2026-04-17-at-5-56-39-PM-1776774238210.jpeg');
  const offerResolved = resolveUploadAlias('/uploads/WhatsApp-Image-2026-04-17-at-5-56-40-PM-1776774361869.jpeg');
  const welcomeResolved = resolveUploadAlias('/uploads/628198102_26851699957852921_8364174062947143509_n.jpg');
  const timestampedWelcomeResolved = resolveUploadAlias('/uploads/628198102_26851699957852921_8364174062947143509_n-1777380639820.jpg');

  assert.equal(resolved?.storedName, 'itroots-flow-data-analytics.jpeg');
  assert.equal(bareResolved?.storedName, 'itroots-flow-data-analytics.jpeg');
  assert.equal(offerResolved?.storedName, 'itroots-flow-offer-sdlc.jpeg');
  assert.equal(welcomeResolved?.storedName, 'itroots-flow-welcome.jpeg');
  assert.equal(timestampedWelcomeResolved?.storedName, 'itroots-flow-welcome.jpeg');
  assert.equal(resolved?.kind, 'image');
  assert.equal(resolveUploadAlias('/uploads/not-aliased.jpeg'), null);
});

test('resolveUploadAlias falls back to latest matching timestamped upload', () => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const olderName = 'template-preview-test-1111111111111.jpg';
  const newerName = 'template-preview-test-2222222222222.jpg';
  const requestedName = 'template-preview-test-3333333333333.jpg';
  const olderPath = path.join(UPLOAD_DIR, olderName);
  const newerPath = path.join(UPLOAD_DIR, newerName);

  fs.writeFileSync(olderPath, Buffer.from('older'));
  fs.writeFileSync(newerPath, Buffer.from('newer'));

  try {
    const resolved = resolveUploadAlias(`/uploads/${requestedName}`);
    assert.equal(resolved?.storedName, newerName);
    assert.equal(resolved?.kind, 'image');
  } finally {
    fs.rmSync(olderPath, { force: true });
    fs.rmSync(newerPath, { force: true });
  }
});

test('resolveUploadAlias falls back across duplicate-index timestamped upload names', () => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const olderName = 'WhatsApp-Image-2026-04-17-at-5-56-39-PM-1-1776442862461.jpeg';
  const newerName = 'WhatsApp-Image-2026-04-17-at-5-56-39-PM-1-1776766526252.jpeg';
  const requestedName = 'WhatsApp-Image-2026-04-17-at-5-56-39-PM-2-1776437614240.jpeg';
  const olderPath = path.join(UPLOAD_DIR, olderName);
  const newerPath = path.join(UPLOAD_DIR, newerName);

  fs.writeFileSync(olderPath, Buffer.from('older'));
  fs.writeFileSync(newerPath, Buffer.from('newer'));

  try {
    const resolved = resolveUploadAlias(`/uploads/${requestedName}`);
    assert.equal(resolved?.storedName, newerName);
    assert.equal(resolved?.kind, 'image');
  } finally {
    fs.rmSync(olderPath, { force: true });
    fs.rmSync(newerPath, { force: true });
  }
});

test('resolveUploadAlias falls back when the stored upload has a duplicate-index suffix but the requested name does not', () => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const olderName = '628198102_26851699957852921_8364174062947143509_n-1-1777381000000.jpg';
  const newerName = '628198102_26851699957852921_8364174062947143509_n-2-1777382000000.jpg';
  const requestedName = '628198102_26851699957852921_8364174062947143509_n-1777380639820.jpg';
  const olderPath = path.join(UPLOAD_DIR, olderName);
  const newerPath = path.join(UPLOAD_DIR, newerName);

  fs.writeFileSync(olderPath, Buffer.from('older'));
  fs.writeFileSync(newerPath, Buffer.from('newer'));

  try {
    const resolved = resolveUploadAlias(`/uploads/${requestedName}`);
    assert.equal(resolved?.storedName, newerName);
    assert.equal(resolved?.kind, 'image');
  } finally {
    fs.rmSync(olderPath, { force: true });
    fs.rmSync(newerPath, { force: true });
  }
});

test('resolveUploadAlias falls back from original media filename to timestamped upload', () => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const olderName = '628198102_26851699957852921_8364174062947143509_n-1777380639820.jpg';
  const newerName = '628198102_26851699957852921_8364174062947143509_n-1777382000000.jpg';
  const requestedName = '628198102_26851699957852921_8364174062947143509_n.jpg';
  const olderPath = path.join(UPLOAD_DIR, olderName);
  const newerPath = path.join(UPLOAD_DIR, newerName);

  fs.writeFileSync(olderPath, Buffer.from('older'));
  fs.writeFileSync(newerPath, Buffer.from('newer'));

  try {
    const resolved = resolveUploadAlias(`/uploads/${requestedName}`);
    assert.equal(resolved?.storedName, newerName);
    assert.equal(resolved?.kind, 'image');
  } finally {
    fs.rmSync(olderPath, { force: true });
    fs.rmSync(newerPath, { force: true });
  }
});

test('verifyWebhookSignature validates Meta signatures against the raw body', () => {
  const previousAppSecret = process.env.META_APP_SECRET;
  process.env.META_APP_SECRET = 'test-secret';
  const rawBody = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }));
  const signature = `sha256=${crypto.createHmac('sha256', process.env.META_APP_SECRET).update(rawBody).digest('hex')}`;

  try {
    const validResult = setupWebhook.verifyWebhookSignature({
      rawBody,
      get(headerName) {
        return headerName.toLowerCase() === 'x-hub-signature-256' ? signature : undefined;
      },
    });
    assert.equal(validResult.ok, true);

    const invalidResult = setupWebhook.verifyWebhookSignature({
      rawBody,
      get() {
        return 'sha256=deadbeef';
      },
    });
    assert.equal(invalidResult.ok, false);
  } finally {
    restoreEnvValue('META_APP_SECRET', previousAppSecret);
  }
});

test('persistInboundMedia stores inbound videos as local uploads for chat previews', async () => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const fakeMeta = {
    async getMediaUrl(mediaId) {
      assert.equal(mediaId, 'meta-video-123');
      return 'https://lookaside.fbsbx.com/whatsapp/media/meta-video-123';
    },
    async downloadMedia(mediaUrl) {
      assert.match(mediaUrl, /meta-video-123$/);
      return Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x14]),
        Buffer.from('ftyp'),
        Buffer.from('isom'),
        Buffer.alloc(8),
      ]);
    },
  };

  const result = await setupWebhook.persistInboundMedia(fakeMeta, {
    id: 'wamid.inbound-video-1',
    type: 'video',
    video: {
      id: 'meta-video-123',
      mime_type: 'video/mp4',
      caption: 'Intro clip',
    },
  });

  assert.match(result.mediaUrl || '', /^\/uploads\/.+\.mp4$/);
  assert.equal(result.metadata?.mediaUrl, result.mediaUrl);
  assert.match(result.metadata?.mediaFilename || '', /^whatsapp-video-wamid\.inbound-video-1\.mp4$/);
  assert.equal(result.metadata?.mediaMimeType, 'video/mp4');

  const storedName = path.basename(result.mediaUrl);
  const absolutePath = path.join(UPLOAD_DIR, storedName);

  try {
    assert.equal(fs.existsSync(absolutePath), true);
  } finally {
    fs.rmSync(absolutePath, { force: true });
  }
});

test('verifyWebhookSignature reports access tokens configured as app secrets', () => {
  const previousAppSecret = process.env.META_APP_SECRET;
  process.env.META_APP_SECRET = `EAA${'x'.repeat(120)}`;

  try {
    const result = setupWebhook.verifyWebhookSignature({
      rawBody: Buffer.from('{}'),
      get() {
        return 'sha256=deadbeef';
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'app-secret-invalid');
  } finally {
    restoreEnvValue('META_APP_SECRET', previousAppSecret);
  }
});

test('validateRuntimeConfig rejects unsafe production secrets and urls', () => {
  const result = validateRuntimeConfig({
    NODE_ENV: 'production',
    JWT_SECRET: 'change_me',
    WEBHOOK_VERIFY_TOKEN: 'your_webhook_verify_token',
    META_APP_SECRET: `EAA${'x'.repeat(120)}`,
    PUBLIC_API_BASE_URL: 'http://api.example.com',
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join(' '), /JWT_SECRET/);
  assert.match(result.issues.join(' '), /WEBHOOK_VERIFY_TOKEN/);
  assert.match(result.issues.join(' '), /META_APP_SECRET/);
  assert.match(result.issues.join(' '), /PUBLIC_API_BASE_URL/);
});

test('validateRuntimeConfig accepts a strong production configuration', () => {
  const result = validateRuntimeConfig({
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(64),
    WEBHOOK_VERIFY_TOKEN: 'b'.repeat(32),
    META_APP_SECRET: 'c'.repeat(32),
    PUBLIC_API_BASE_URL: 'https://api.example.com',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});
