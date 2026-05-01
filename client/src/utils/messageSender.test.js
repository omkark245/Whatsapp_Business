import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getMessageSenderDetails, getMessageSenderSummary } from './messageSender.js';

test('getMessageSenderSummary prefers sender user names for outbound messages', () => {
  assert.equal(
    getMessageSenderSummary({
      direction: 'outbound',
      metadata: {
        senderSource: 'campaign',
        senderUser: { id: 2, name: 'Omkar' },
      },
    }),
    'Sent by Omkar'
  );
});

test('getMessageSenderSummary falls back to sender source for automated outbound messages', () => {
  assert.equal(
    getMessageSenderSummary({
      direction: 'outbound',
      metadata: { senderSource: 'auto_reply' },
    }),
    'Sent by Auto reply'
  );
});

test('getMessageSenderDetails includes both source and user when available', () => {
  assert.equal(
    getMessageSenderDetails({
      direction: 'outbound',
      metadata: {
        senderSource: 'campaign',
        senderUser: { id: 2, name: 'Omkar' },
      },
    }),
    'Campaign by Omkar'
  );
});

test('getMessageSenderDetails falls back safely for old outbound messages', () => {
  assert.equal(
    getMessageSenderDetails({
      direction: 'outbound',
      metadata: null,
    }),
    'Sent'
  );
});
