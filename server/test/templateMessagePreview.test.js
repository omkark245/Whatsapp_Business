const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  buildTemplateDisplayText,
  buildTemplateMediaPreview,
  buildTemplateMediaPreviewFromComponents,
} = require('../src/utils/templateMessagePreview');
const { UPLOAD_DIR } = require('../src/utils/uploads');

test('buildTemplateDisplayText includes rendered body, footer, and buttons', () => {
  assert.equal(
    buildTemplateDisplayText(
      {
        footer: 'Footer line',
        buttons: [{ text: 'More Details' }, { text: 'Visit Website' }],
      },
      'Hello Aniket'
    ),
    'Hello Aniket\n\nFooter line\n\nButtons:\n- More Details\n- Visit Website'
  );
});

test('buildTemplateMediaPreview keeps upload references for template image headers', () => {
  assert.deepEqual(
    buildTemplateMediaPreview(
      {
        headerType: 'image',
        headerContent: '/uploads/original-image.png',
      },
      {
        headerMediaUrl: '/uploads/welcome-banner.png',
      },
      {
        type: 'image',
        image: { id: '1234567890' },
      }
    ),
    {
      kind: 'image',
      mediaUrl: '/uploads/welcome-banner.png',
      filename: 'welcome-banner.png',
    }
  );
});

test('buildTemplateMediaPreviewFromComponents uses linked media for manual template sends', () => {
  assert.deepEqual(
    buildTemplateMediaPreviewFromComponents([
      {
        type: 'header',
        parameters: [
          {
            type: 'image',
            image: { link: 'https://cdn.example.com/header.png' },
          },
        ],
      },
    ]),
    {
      kind: 'image',
      mediaUrl: 'https://cdn.example.com/header.png',
      filename: 'header.png',
    }
  );
});

test('buildTemplateMediaPreviewFromComponents ignores Meta sample media links when a stable fallback exists', () => {
  assert.deepEqual(
    buildTemplateMediaPreviewFromComponents(
      [
        {
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: { link: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/sample-image' },
            },
          ],
        },
      ],
      'https://api.whatsapp.finlectechnologies.com/uploads/reliable-header.png'
    ),
    {
      kind: 'image',
      mediaUrl: 'https://api.whatsapp.finlectechnologies.com/uploads/reliable-header.png',
      filename: 'reliable-header.png',
    }
  );
});

test('buildTemplateMediaPreview returns null for Meta sample media without a reusable fallback', () => {
  assert.equal(
    buildTemplateMediaPreview(
      {
        headerType: 'image',
        headerContent: 'https://scontent.whatsapp.net/v/t61.29466-34/sample-image',
      }
    ),
    null
  );
});

test('buildTemplateMediaPreview normalizes existing upload URLs to local paths', () => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const storedName = 'template-preview-normalized.png';
  const absolutePath = path.join(UPLOAD_DIR, storedName);

  fs.writeFileSync(absolutePath, Buffer.from('png'));

  try {
    assert.deepEqual(
      buildTemplateMediaPreview({
        headerType: 'image',
        headerContent: `https://old-api.example.com/uploads/${storedName}`,
      }),
      {
        kind: 'image',
        mediaUrl: `/uploads/${storedName}`,
        filename: storedName,
      }
    );
  } finally {
    fs.unlinkSync(absolutePath);
  }
});

test('buildTemplateMediaPreview prefers the actual header media link over the fallback template reference', () => {
  const preview = buildTemplateMediaPreview(
    {
      headerType: 'image',
      headerContent: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/sample-image',
    },
    {
      headerMediaUrl: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/older-sample-image',
    },
    {
      image: {
        link: 'https://cdn.example.com/campaigns/real-banner.png',
      },
    }
  );

  assert.deepEqual(preview, {
    kind: 'image',
    mediaUrl: 'https://cdn.example.com/campaigns/real-banner.png',
    filename: 'real-banner.png',
  });
});

test('buildTemplateMediaPreviewFromComponents prefers the sent header link over the fallback media reference', () => {
  const preview = buildTemplateMediaPreviewFromComponents(
    [
      {
        type: 'header',
        parameters: [
          {
            type: 'image',
            image: {
              link: 'https://cdn.example.com/campaigns/live-banner.png',
            },
          },
        ],
      },
    ],
    'https://lookaside.fbsbx.com/whatsapp_business/attachments/sample-image'
  );

  assert.deepEqual(preview, {
    kind: 'image',
    mediaUrl: 'https://cdn.example.com/campaigns/live-banner.png',
    filename: 'live-banner.png',
  });
});
