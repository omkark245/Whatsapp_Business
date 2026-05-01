export const MESSAGE_SENDER_SOURCE_LABELS = Object.freeze({
  manual_chat: 'Manual chat',
  campaign: 'Campaign',
  drip_campaign: 'Drip campaign',
  flow: 'Flow',
  auto_reply: 'Auto reply',
  webhook_reply: 'Webhook reply',
  system: 'System',
});

export function getMessageSenderSourceLabel(message) {
  const source = message?.metadata?.senderSource;
  return MESSAGE_SENDER_SOURCE_LABELS[source] || '';
}

export function getMessageSenderSummary(message) {
  if (message?.direction !== 'outbound') return '';

  const senderName = message?.metadata?.senderUser?.name?.trim?.() || '';
  if (senderName) {
    return `Sent by ${senderName}`;
  }

  const sourceLabel = getMessageSenderSourceLabel(message);
  if (sourceLabel) {
    return `Sent by ${sourceLabel}`;
  }

  return '';
}

export function getMessageSenderDetails(message) {
  if (message?.direction !== 'outbound') return 'Sent';

  const sourceLabel = getMessageSenderSourceLabel(message);
  const senderName = message?.metadata?.senderUser?.name?.trim?.() || '';

  if (sourceLabel && senderName) {
    return `${sourceLabel} by ${senderName}`;
  }

  if (sourceLabel) {
    return sourceLabel;
  }

  if (senderName) {
    return `Sent by ${senderName}`;
  }

  return 'Sent';
}
