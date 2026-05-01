const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_INTERACTIVE_BODY_TEXT,
  buildReplyButtons,
  getReplyButtonValidationIssues,
  normalizeInteractiveBodyText,
  sanitizeFlowInteractiveMessages,
  validateFlowInteractiveMessages,
} = require('../src/utils/flowInteractive');

test('buildReplyButtons trims labels, drops blank buttons, and caps title length', () => {
  const buttons = buildReplyButtons([
    { title: '  Book   Demo  ', payload: 'book demo' },
    { title: '   ' },
    { title: '1234567890123456789012345' },
  ]);

  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].reply.title, 'Book Demo');
  assert.equal(buttons[0].reply.id, 'book_demo_0');
  assert.equal(buttons[1].reply.title, '12345678901234567890');
});

test('normalizeInteractiveBodyText trims outer whitespace and normalizes newlines', () => {
  assert.equal(
    normalizeInteractiveBodyText('\r\n  Hello there\r\nHow are you?  \r\n'),
    'Hello there\nHow are you?'
  );
});

test('getReplyButtonValidationIssues reports invalid interactive button message shapes', () => {
  const issues = getReplyButtonValidationIssues('', [
    { title: 'Yes' },
    { title: '   ' },
    { title: 'No' },
    { title: 'Maybe' },
  ]);

  assert.deepEqual(issues, [
    'Interactive button messages need message text.',
    'Interactive button messages support at most 3 buttons.',
    'Interactive button labels cannot be blank.',
  ]);
});

test('validateFlowInteractiveMessages ignores media nodes and reports invalid text button nodes', () => {
  const details = validateFlowInteractiveMessages({
    nodes: [
      {
        id: 'welcome-image',
        type: 'messageNode',
        data: {
          messageType: 'image',
          text: '',
          buttons: [{ title: 'Choose Course' }],
        },
      },
      {
        id: 'broken-text-node',
        type: 'messageNode',
        data: {
          messageType: 'text',
          text: '   ',
          buttons: [{ title: 'Choose Course' }],
        },
      },
    ],
  });

  assert.deepEqual(details, [
    {
      nodeId: 'broken-text-node',
      field: 'buttons',
      message: 'Interactive button messages need message text.',
    },
  ]);
});

test('sanitizeFlowInteractiveMessages fixes invalid text quick reply nodes before save', () => {
  const sanitized = sanitizeFlowInteractiveMessages({
    nodes: [
      {
        id: 'broken-text-node',
        type: 'messageNode',
        data: {
          messageType: 'text',
          text: '   ',
          buttons: [
            { title: '  Book   Demo  ', payload: '' },
            { title: '   ', payload: '' },
            { title: '1234567890123456789012345', payload: '' },
          ],
        },
      },
    ],
    edges: [],
  });

  assert.equal(sanitized.nodes[0].data.text, DEFAULT_INTERACTIVE_BODY_TEXT);
  assert.deepEqual(sanitized.nodes[0].data.buttons, [
    { title: 'Book Demo', payload: '' },
    { title: '12345678901234567890', payload: '' },
  ]);
  assert.deepEqual(validateFlowInteractiveMessages(sanitized), []);
});
