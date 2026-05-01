export const DEFAULT_BUTTON_MESSAGE_TEXT = 'Please choose an option:';
export const MAX_QUICK_REPLY_BUTTONS = 3;
export const MAX_QUICK_REPLY_TITLE_LENGTH = 20;

export const defaultData = {
  messageNode: { text: '', messageType: 'text', buttons: [], mediaUrl: '', listSections: [] },
  conditionNode: { value: '', matchType: 'contains' },
  delayNode: { seconds: 60 },
  apiNode: { method: 'GET', url: '', headers: '{}', body: '', saveResponseAs: '' },
  endNode: { label: 'Conversation ends', action: '', tagName: '' },
};

function normalizeBodyText(value = '') {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function normalizeButtonTitle(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isTextMessageData(data = {}) {
  return String(data.messageType || 'text').toLowerCase() === 'text';
}

function areButtonsEqual(left = [], right = []) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function normalizeQuickReplyButtons(buttons = []) {
  if (!Array.isArray(buttons)) return [];

  return buttons
    .map((button) => {
      const title = normalizeButtonTitle(button?.title).slice(0, MAX_QUICK_REPLY_TITLE_LENGTH);
      if (!title) return null;
      return { ...button, title };
    })
    .filter(Boolean)
    .slice(0, MAX_QUICK_REPLY_BUTTONS);
}

export function sanitizeFlowNodesForSave(nodes = []) {
  const autoFilledNodeIds = [];
  const normalizedButtonNodeIds = [];
  let changed = false;

  const sanitizedNodes = nodes.map((node) => {
    if (node?.type !== 'messageNode') return node;

    const data = node.data || {};
    const rawButtons = Array.isArray(data.buttons) ? data.buttons : [];
    const buttons = normalizeQuickReplyButtons(rawButtons);
    let nextData = data;

    if (!areButtonsEqual(rawButtons, buttons)) {
      nextData = { ...nextData, buttons };
      normalizedButtonNodeIds.push(node.id);
      changed = true;
    }

    if (isTextMessageData(nextData) && buttons.length > 0 && !normalizeBodyText(nextData.text)) {
      nextData = { ...nextData, text: DEFAULT_BUTTON_MESSAGE_TEXT };
      autoFilledNodeIds.push(node.id);
      changed = true;
    }

    return nextData === data ? node : { ...node, data: nextData };
  });

  return {
    nodes: sanitizedNodes,
    changed,
    autoFilledNodeIds,
    normalizedButtonNodeIds,
  };
}
