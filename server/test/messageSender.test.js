const test = require('node:test');
const assert = require('node:assert/strict');

const { buildContactPayload } = require('../src/utils/socketEvents');
const { MESSAGE_SENDER_SOURCES, sanitizeSenderUser, withSenderMetadata } = require('../src/utils/messageSender');

test('withSenderMetadata adds sender source and user to message metadata', () => {
  const metadata = withSenderMetadata(
    { templateDisplay: 'Hello there' },
    MESSAGE_SENDER_SOURCES.CAMPAIGN,
    { id: 7, name: 'Omkar' }
  );

  assert.deepEqual(metadata, {
    templateDisplay: 'Hello there',
    senderSource: 'campaign',
    senderUser: {
      id: 7,
      name: 'Omkar',
    },
  });
});

test('sanitizeSenderUser rejects incomplete sender values', () => {
  assert.equal(sanitizeSenderUser(null), null);
  assert.equal(sanitizeSenderUser({ id: 4 }), null);
  assert.equal(sanitizeSenderUser({ name: 'Omkar' }), null);
  assert.equal(sanitizeSenderUser({ id: 4, name: '  ' }), null);
});

test('buildContactPayload keeps sender metadata in the realtime last-message preview', () => {
  const payload = buildContactPayload(
    {
      id: 10,
      waId: '919876543210',
      phone: '9876543210',
      name: 'Lead',
    },
    {
      id: 22,
      type: 'text',
      content: 'Hello',
      direction: 'outbound',
      status: 'sent',
      metadata: withSenderMetadata(null, MESSAGE_SENDER_SOURCES.MANUAL_CHAT, { id: 3, name: 'Omkar' }),
      createdAt: '2026-04-27T09:00:00.000Z',
    }
  );

  assert.deepEqual(payload.messages, [{
    id: 22,
    type: 'text',
    content: 'Hello',
    direction: 'outbound',
    status: 'sent',
    metadata: {
      senderSource: 'manual_chat',
      senderUser: {
        id: 3,
        name: 'Omkar',
      },
    },
    createdAt: '2026-04-27T09:00:00.000Z',
  }]);
});
