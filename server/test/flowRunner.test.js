const test = require('node:test');
const assert = require('node:assert/strict');

const { __test__ } = require('../src/services/flowRunner');

test('buildPublicMediaUrl converts stored upload paths into absolute URLs', () => {
  const previousBaseUrl = process.env.PUBLIC_API_BASE_URL;
  process.env.PUBLIC_API_BASE_URL = 'https://api.example.com/';

  try {
    assert.equal(
      __test__.buildPublicMediaUrl('/uploads/itroots-flow-data-analytics.jpeg'),
      'https://api.example.com/uploads/itroots-flow-data-analytics.jpeg'
    );
    assert.equal(
      __test__.buildPublicMediaUrl('uploads/itroots-flow-data-analytics.jpeg'),
      'https://api.example.com/uploads/itroots-flow-data-analytics.jpeg'
    );
    assert.equal(
      __test__.buildPublicMediaUrl('https://whatsapp.finlectechnologies.com/uploads/itroots-flow-data-analytics.jpeg'),
      'https://api.example.com/uploads/itroots-flow-data-analytics.jpeg'
    );
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.PUBLIC_API_BASE_URL;
    } else {
      process.env.PUBLIC_API_BASE_URL = previousBaseUrl;
    }
  }
});

test('buildPublicMediaUrl accepts absolute http URLs and rejects arbitrary relative paths', () => {
  assert.equal(
    __test__.buildPublicMediaUrl('https://cdn.example.com/media/photo.jpg'),
    'https://cdn.example.com/media/photo.jpg'
  );
  assert.equal(__test__.buildPublicMediaUrl('photo.jpg'), '');
});

test('applyVariables leaves business profile data untouched when placeholders are absent', async () => {
  let profileFetchCount = 0;

  const result = await __test__.applyVariables(
    'Hello {{name}} on {{phone}}',
    { name: 'Omkar', phone: '9988776655' },
    {
      waAccount: { phoneNumber: '919988776655' },
      runtimeContext: {},
      meta: {
        getBusinessProfile: async () => {
          profileFetchCount += 1;
          return { data: [{ websites: ['https://example.com'] }] };
        },
      },
    }
  );

  assert.equal(result, 'Hello Omkar on 9988776655');
  assert.equal(profileFetchCount, 0);
});

test('applyVariables resolves business phone and website placeholders from account and profile data', async () => {
  let profileFetchCount = 0;
  const runtimeContext = {};
  const meta = {
    getBusinessProfile: async () => {
      profileFetchCount += 1;
      return { data: [{ websites: ['www.finlectechnologies.com', 'https://fallback.example.com'] }] };
    },
  };

  const firstResult = await __test__.applyVariables(
    'Call: {{business_phone}}\nWebsite: {{business_website}}',
    { name: 'User', phone: '12345' },
    {
      waAccount: { phoneNumber: '919112233445' },
      runtimeContext,
      meta,
    }
  );

  const secondResult = await __test__.applyVariables(
    'Visit {{business_website}}',
    { name: 'User', phone: '12345' },
    {
      waAccount: { phoneNumber: '919112233445' },
      runtimeContext,
      meta,
    }
  );

  assert.equal(firstResult, 'Call: 919112233445\nWebsite: https://www.finlectechnologies.com');
  assert.equal(secondResult, 'Visit https://www.finlectechnologies.com');
  assert.equal(profileFetchCount, 1);
});

test('resolveBusinessContactDetails falls back safely when phone or website are unavailable', async () => {
  const details = await __test__.resolveBusinessContactDetails(
    { phoneNumber: '' },
    {},
    {
      getBusinessProfile: async () => ({ data: [{ websites: ['not-a-link'] }] }),
    }
  );

  assert.deepEqual(details, {
    phone: 'Phone support currently unavailable',
    website: 'Website link currently unavailable',
  });
});

test('buildFlowMediaReference uploads existing stored files to Meta', async () => {
  const mediaReference = await __test__.buildFlowMediaReference(
    {
      uploadMediaFromBuffer: async (buffer, options) => {
        assert.ok(buffer.length > 0);
        assert.equal(options.filename, 'itroots-flow-data-analytics.jpeg');
        assert.equal(options.mimeType, 'image/jpeg');
        return 'meta-media-id';
      },
    },
    { mediaUrl: '/uploads/itroots-flow-data-analytics.jpeg' },
    'image'
  );

  assert.deepEqual(mediaReference, { id: 'meta-media-id' });
});

test('buildFlowMediaReference uploads aliased legacy flow media to Meta', async () => {
  const mediaReference = await __test__.buildFlowMediaReference(
    {
      uploadMediaFromBuffer: async (buffer, options) => {
        assert.ok(buffer.length > 0);
        assert.equal(options.filename, 'itroots-flow-data-analytics.jpeg');
        assert.equal(options.mimeType, 'image/jpeg');
        return 'meta-aliased-media-id';
      },
    },
    { mediaUrl: '/uploads/WhatsApp-Image-2026-04-17-at-5-56-39-PM-1776774238210.jpeg' },
    'image'
  );

  assert.deepEqual(mediaReference, { id: 'meta-aliased-media-id' });
});

test('buildFlowMediaReference uploads legacy offer media aliases to Meta', async () => {
  const mediaReference = await __test__.buildFlowMediaReference(
    {
      uploadMediaFromBuffer: async (buffer, options) => {
        assert.ok(buffer.length > 0);
        assert.equal(options.filename, 'itroots-flow-offer-sdlc.jpeg');
        assert.equal(options.mimeType, 'image/jpeg');
        return 'meta-offer-media-id';
      },
    },
    { mediaUrl: 'https://api.whatsapp.finlectechnologies.com/uploads/WhatsApp-Image-2026-04-17-at-5-56-40-PM-1776774361869.jpeg' },
    'image'
  );

  assert.deepEqual(mediaReference, { id: 'meta-offer-media-id' });
});

test('buildFlowMediaReference falls back to public links for missing managed uploads', async () => {
  const previousBaseUrl = process.env.PUBLIC_API_BASE_URL;
  process.env.PUBLIC_API_BASE_URL = 'https://api.example.com';

  try {
    assert.deepEqual(
      await __test__.buildFlowMediaReference({}, { mediaUrl: '/uploads/missing-flow-image.jpeg' }, 'image'),
      { link: 'https://api.example.com/uploads/missing-flow-image.jpeg' }
    );
    assert.deepEqual(
      await __test__.buildFlowMediaReference({}, { mediaUrl: 'https://api.example.com/uploads/missing-flow-image.jpeg' }, 'image'),
      { link: 'https://api.example.com/uploads/missing-flow-image.jpeg' }
    );
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.PUBLIC_API_BASE_URL;
    } else {
      process.env.PUBLIC_API_BASE_URL = previousBaseUrl;
    }
  }
});

test('buildFlowMediaReference allows external public media URLs', async () => {
  assert.deepEqual(
    await __test__.buildFlowMediaReference(
      {},
      { mediaUrl: 'https://cdn.example.com/media/photo.jpg' },
      'image'
    ),
    { link: 'https://cdn.example.com/media/photo.jpg' }
  );
});
