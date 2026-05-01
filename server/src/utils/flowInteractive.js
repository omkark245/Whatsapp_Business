const MAX_INTERACTIVE_BODY_LENGTH = 1024;
const MAX_REPLY_BUTTONS = 3;
const MAX_REPLY_BUTTON_TITLE_LENGTH = 20;
const MAX_REPLY_BUTTON_ID_LENGTH = 256;
const DEFAULT_INTERACTIVE_BODY_TEXT = 'Please choose an option:';

function normalizeInteractiveBodyText(value = '') {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function normalizeInteractiveLabel(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifyReplyButtonId(value, index) {
  const safeIndex = Number.isFinite(index) ? index : 0;
  const base = normalizeInteractiveLabel(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_REPLY_BUTTON_ID_LENGTH - 12);

  return base ? `${base}_${safeIndex}` : `btn_${safeIndex}`;
}

function buildReplyButtons(buttons = []) {
  return buttons
    .map((button, index) => {
      const title = normalizeInteractiveLabel(button?.title).slice(0, MAX_REPLY_BUTTON_TITLE_LENGTH);
      if (!title) return null;

      return {
        type: 'reply',
        reply: {
          id: slugifyReplyButtonId(button?.payload || button?.title, index),
          title,
        },
      };
    })
    .filter(Boolean)
    .slice(0, MAX_REPLY_BUTTONS);
}

function normalizeReplyButtonDefinitions(buttons = []) {
  if (!Array.isArray(buttons)) return [];

  return buttons
    .map((button) => {
      const title = normalizeInteractiveLabel(button?.title).slice(0, MAX_REPLY_BUTTON_TITLE_LENGTH);
      if (!title) return null;

      return {
        ...button,
        title,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_REPLY_BUTTONS);
}

function getReplyButtonValidationIssues(text, buttons = [], builtButtons = buildReplyButtons(buttons)) {
  const issues = [];
  const normalizedBody = normalizeInteractiveBodyText(text);
  const rawButtons = Array.isArray(buttons) ? buttons : [];

  if (!normalizedBody) {
    issues.push('Interactive button messages need message text.');
  } else if (normalizedBody.length > MAX_INTERACTIVE_BODY_LENGTH) {
    issues.push(`Interactive button text must be ${MAX_INTERACTIVE_BODY_LENGTH} characters or less.`);
  }

  if (rawButtons.length > MAX_REPLY_BUTTONS) {
    issues.push(`Interactive button messages support at most ${MAX_REPLY_BUTTONS} buttons.`);
  }

  if (rawButtons.some((button) => !normalizeInteractiveLabel(button?.title))) {
    issues.push('Interactive button labels cannot be blank.');
  }

  if (builtButtons.length === 0) {
    issues.push('Add at least one valid button label.');
  }

  return issues;
}

function validateFlowInteractiveMessages(flowData) {
  const nodes = Array.isArray(flowData?.nodes) ? flowData.nodes : [];
  const details = [];

  nodes.forEach((node) => {
    if (node?.type !== 'messageNode') return;

    const messageType = String(node?.data?.messageType || 'text').toLowerCase();
    const buttons = Array.isArray(node?.data?.buttons) ? node.data.buttons : [];

    if (messageType !== 'text' || buttons.length === 0) return;

    const issues = getReplyButtonValidationIssues(node?.data?.text, buttons);
    issues.forEach((message) => {
      details.push({
        nodeId: node.id || null,
        field: 'buttons',
        message,
      });
    });
  });

  return details;
}

function sanitizeFlowInteractiveMessages(flowData) {
  const safeFlowData = flowData && typeof flowData === 'object' ? flowData : { nodes: [], edges: [] };
  const nodes = Array.isArray(safeFlowData.nodes) ? safeFlowData.nodes : [];

  return {
    ...safeFlowData,
    nodes: nodes.map((node) => {
      if (node?.type !== 'messageNode') return node;

      const data = node.data || {};
      const messageType = String(data.messageType || 'text').toLowerCase();
      if (messageType !== 'text') return node;

      const rawButtons = Array.isArray(data.buttons) ? data.buttons : [];
      const buttons = normalizeReplyButtonDefinitions(rawButtons);
      if (buttons.length === 0) {
        if (rawButtons.length === 0) return node;

        return {
          ...node,
          data: {
            ...data,
            buttons,
          },
        };
      }

      return {
        ...node,
        data: {
          ...data,
          text: normalizeInteractiveBodyText(data.text) || DEFAULT_INTERACTIVE_BODY_TEXT,
          buttons,
        },
      };
    }),
  };
}

module.exports = {
  DEFAULT_INTERACTIVE_BODY_TEXT,
  MAX_INTERACTIVE_BODY_LENGTH,
  buildReplyButtons,
  getReplyButtonValidationIssues,
  normalizeReplyButtonDefinitions,
  normalizeInteractiveBodyText,
  sanitizeFlowInteractiveMessages,
  validateFlowInteractiveMessages,
};
