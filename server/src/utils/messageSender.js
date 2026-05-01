const MESSAGE_SENDER_SOURCES = Object.freeze({
  MANUAL_CHAT: 'manual_chat',
  CAMPAIGN: 'campaign',
  DRIP_CAMPAIGN: 'drip_campaign',
  FLOW: 'flow',
  AUTO_REPLY: 'auto_reply',
  WEBHOOK_REPLY: 'webhook_reply',
  SYSTEM: 'system',
});

function sanitizeSenderUser(user) {
  if (!user) return null;

  const id = user.id ? Number(user.id) : null;
  const name = typeof user.name === 'string' ? user.name.trim() : '';

  if (!id || !name) return null;

  return { id, name };
}

function buildSenderMetadata(senderSource, user = null) {
  const metadata = {};

  if (senderSource) {
    metadata.senderSource = senderSource;
  }

  const senderUser = sanitizeSenderUser(user);
  if (senderUser) {
    metadata.senderUser = senderUser;
  }

  return metadata;
}

function withSenderMetadata(metadata = null, senderSource, user = null) {
  const base = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  return {
    ...base,
    ...buildSenderMetadata(senderSource, user),
  };
}

module.exports = {
  MESSAGE_SENDER_SOURCES,
  buildSenderMetadata,
  sanitizeSenderUser,
  withSenderMetadata,
};
