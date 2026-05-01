import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getMessageMediaSpec, resolveMediaAssetUrl } from './messageMedia.js';

test('resolveMediaAssetUrl expands managed upload paths against the API origin', () => {
  assert.equal(
    resolveMediaAssetUrl('/uploads/welcome-banner.png', {
      apiBaseUrl: 'https://api.whatsapp.finlectechnologies.com/api',
      origin: 'https://app.whatsapp.finlectechnologies.com',
    }),
    'https://api.whatsapp.finlectechnologies.com/uploads/welcome-banner.png'
  );
  assert.equal(
    resolveMediaAssetUrl('https://whatsapp.finlectechnologies.com/uploads/welcome-banner.png', {
      apiBaseUrl: 'https://api.whatsapp.finlectechnologies.com/api',
      origin: 'https://whatsapp.finlectechnologies.com',
    }),
    'https://api.whatsapp.finlectechnologies.com/uploads/welcome-banner.png'
  );
  assert.equal(
    resolveMediaAssetUrl('/api/uploads/welcome-banner.png', {
      apiBaseUrl: 'https://api.whatsapp.finlectechnologies.com/api',
      origin: 'https://whatsapp.finlectechnologies.com',
    }),
    'https://api.whatsapp.finlectechnologies.com/uploads/welcome-banner.png'
  );
});

test('getMessageMediaSpec returns template image previews from metadata', () => {
  assert.deepEqual(
    getMessageMediaSpec(
      {
        type: 'template',
        content: 'Hello Aniket',
        metadata: {
          templateMedia: {
            kind: 'image',
            mediaUrl: '/uploads/welcome-banner.png',
            filename: 'welcome-banner.png',
          },
        },
      },
      {
        apiBaseUrl: 'https://api.whatsapp.finlectechnologies.com/api',
        origin: 'https://app.whatsapp.finlectechnologies.com',
      }
    ),
    {
      kind: 'image',
      mediaUrl: 'https://api.whatsapp.finlectechnologies.com/uploads/welcome-banner.png',
      candidateUrls: ['https://api.whatsapp.finlectechnologies.com/uploads/welcome-banner.png'],
      label: 'welcome-banner.png',
    }
  );
});

test('getMessageMediaSpec returns template document previews with filenames', () => {
  assert.deepEqual(
    getMessageMediaSpec(
      {
        type: 'template',
        content: 'Brochure',
        metadata: {
          templateMedia: {
            kind: 'document',
            mediaUrl: 'https://cdn.example.com/brochure.pdf',
            filename: 'brochure.pdf',
          },
        },
      },
      {
        apiBaseUrl: 'https://api.whatsapp.finlectechnologies.com/api',
        origin: 'https://app.whatsapp.finlectechnologies.com',
      }
    ),
    {
      kind: 'document',
      mediaUrl: 'https://cdn.example.com/brochure.pdf',
      candidateUrls: ['https://cdn.example.com/brochure.pdf'],
      label: 'brochure.pdf',
    }
  );
});

test('getMessageMediaSpec retries legacy api upload paths and filename-based uploads', () => {
  assert.deepEqual(
    getMessageMediaSpec(
      {
        type: 'template',
        content: 'Promo',
        metadata: {
          templateMedia: {
            kind: 'image',
            mediaUrl: '/api/uploads/missing-preview.png',
            filename: 'missing-preview.png',
          },
        },
      },
      {
        apiBaseUrl: 'https://api.whatsapp.finlectechnologies.com/api',
        origin: 'https://whatsapp.finlectechnologies.com',
      }
    ),
    {
      kind: 'image',
      mediaUrl: 'https://api.whatsapp.finlectechnologies.com/uploads/missing-preview.png',
      candidateUrls: ['https://api.whatsapp.finlectechnologies.com/uploads/missing-preview.png'],
      label: 'missing-preview.png',
    }
  );
});

test('getMessageMediaSpec ignores Meta sample URLs and prefers stable upload media', () => {
  assert.deepEqual(
    getMessageMediaSpec(
      {
        type: 'template',
        content: 'Promo',
        mediaUrl: '/uploads/stable-preview.png',
        metadata: {
          templateMedia: {
            kind: 'image',
            mediaUrl: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/sample-image',
            filename: 'stable-preview.png',
          },
        },
      },
      {
        apiBaseUrl: 'https://api.whatsapp.finlectechnologies.com/api',
        origin: 'https://whatsapp.finlectechnologies.com',
      }
    ),
    {
      kind: 'image',
      mediaUrl: 'https://api.whatsapp.finlectechnologies.com/uploads/stable-preview.png',
      candidateUrls: ['https://api.whatsapp.finlectechnologies.com/uploads/stable-preview.png'],
      label: 'stable-preview.png',
    }
  );
});

test('getMessageMediaSpec keeps alias recovery for Meta sample URLs before rejecting the direct sample link', () => {
  assert.deepEqual(
    getMessageMediaSpec(
      {
        type: 'template',
        content: 'Promo',
        metadata: {
          templateMedia: {
            kind: 'image',
            mediaUrl: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/628198102_26851699957852921_8364174062947143509_n.jpg',
            filename: '628198102_26851699957852921_8364174062947143509_n.jpg',
          },
        },
      },
      {
        apiBaseUrl: 'https://api.whatsapp.finlectechnologies.com/api',
        origin: 'https://whatsapp.finlectechnologies.com',
      }
    ),
    {
      kind: 'image',
      mediaUrl: 'https://api.whatsapp.finlectechnologies.com/uploads/itroots-flow-welcome.jpeg',
      candidateUrls: [
        'https://api.whatsapp.finlectechnologies.com/uploads/itroots-flow-welcome.jpeg',
        'https://lookaside.fbsbx.com/whatsapp_business/attachments/628198102_26851699957852921_8364174062947143509_n.jpg',
      ],
      label: '628198102_26851699957852921_8364174062947143509_n.jpg',
    }
  );
});

test('getMessageMediaSpec falls back to stored template header components when templateMedia is missing', () => {
  assert.deepEqual(
    getMessageMediaSpec(
      {
        type: 'template',
        content: 'Kickstart Your IT Career with Finlec Technologies!',
        metadata: {
          components: [
            {
              type: 'header',
              parameters: [
                {
                  type: 'image',
                  image: {
                    link: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/628198102_26851699957852921_8364174062947143509_n.jpg',
                  },
                },
              ],
            },
          ],
        },
      },
      {
        apiBaseUrl: 'https://api.whatsapp.finlectechnologies.com/api',
        origin: 'https://whatsapp.finlectechnologies.com',
      }
    ),
    {
      kind: 'image',
      mediaUrl: 'https://api.whatsapp.finlectechnologies.com/uploads/itroots-flow-welcome.jpeg',
      candidateUrls: [
        'https://api.whatsapp.finlectechnologies.com/uploads/itroots-flow-welcome.jpeg',
        'https://lookaside.fbsbx.com/whatsapp_business/attachments/628198102_26851699957852921_8364174062947143509_n.jpg',
      ],
      label: 'Kickstart Your IT Career with Finlec Technologies!',
    }
  );
});

test('getMessageMediaSpec uses the direct sample URL when no stable alias exists', () => {
  assert.deepEqual(
    getMessageMediaSpec(
      {
        type: 'template',
        content: 'Kickstart Your IT Career with Finlec Technologies!',
        metadata: {
          components: [
            {
              type: 'header',
              parameters: [
                {
                  type: 'image',
                  image: {
                    link: 'https://scontent.whatsapp.net/v/t61.29466-34/674990161_26283213074684644_3418059312570080828_n.jpg?ccb=1-7',
                  },
                },
              ],
            },
          ],
        },
      },
      {
        apiBaseUrl: 'http://localhost:5001/api',
        origin: 'http://localhost:5173',
      }
    ),
    {
      kind: 'image',
      mediaUrl: 'https://scontent.whatsapp.net/v/t61.29466-34/674990161_26283213074684644_3418059312570080828_n.jpg?ccb=1-7',
      candidateUrls: ['https://scontent.whatsapp.net/v/t61.29466-34/674990161_26283213074684644_3418059312570080828_n.jpg?ccb=1-7'],
      label: 'Kickstart Your IT Career with Finlec Technologies!',
    }
  );
});

test('getMessageMediaSpec maps legacy legacy header filenames to stable upload media', () => {
  assert.deepEqual(
    getMessageMediaSpec(
      {
        type: 'template',
        content: 'Kickstart Your IT Career with Finlec Technologies!',
        metadata: {
          templateMedia: {
            kind: 'image',
            mediaUrl: '/uploads/628198102_26851699957852921_8364174062947143509_n.jpg',
            filename: '628198102_26851699957852921_8364174062947143509_n.jpg',
          },
        },
      },
      {
        apiBaseUrl: 'https://api.whatsapp.finlectechnologies.com/api',
        origin: 'https://whatsapp.finlectechnologies.com',
      }
    ),
    {
      kind: 'image',
      mediaUrl: 'https://api.whatsapp.finlectechnologies.com/uploads/itroots-flow-welcome.jpeg',
      candidateUrls: [
        'https://api.whatsapp.finlectechnologies.com/uploads/itroots-flow-welcome.jpeg',
        'https://api.whatsapp.finlectechnologies.com/uploads/628198102_26851699957852921_8364174062947143509_n.jpg',
      ],
      label: '628198102_26851699957852921_8364174062947143509_n.jpg',
    }
  );
});
