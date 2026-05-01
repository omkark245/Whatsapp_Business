import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BUTTON_MESSAGE_TEXT,
  normalizeQuickReplyButtons,
  sanitizeFlowNodesForSave,
} from './flowBuilderDefaults.js';

test('normalizeQuickReplyButtons removes blank labels and caps quick reply buttons', () => {
  const buttons = normalizeQuickReplyButtons([
    { title: ' Yes ', payload: 'yes' },
    { title: '   ' },
    { title: 'No' },
    { title: 'Maybe' },
    { title: 'Later' },
  ]);

  assert.deepEqual(buttons, [
    { title: 'Yes', payload: 'yes' },
    { title: 'No' },
    { title: 'Maybe' },
  ]);
});

test('sanitizeFlowNodesForSave adds body text to text quick reply messages', () => {
  const result = sanitizeFlowNodesForSave([
    {
      id: 'message-1',
      type: 'messageNode',
      data: {
        messageType: 'text',
        text: '   ',
        buttons: [{ title: 'Book Demo', payload: '' }],
      },
    },
  ]);

  assert.equal(result.changed, true);
  assert.deepEqual(result.autoFilledNodeIds, ['message-1']);
  assert.equal(result.nodes[0].data.text, DEFAULT_BUTTON_MESSAGE_TEXT);
});

test('sanitizeFlowNodesForSave removes empty quick reply buttons without forcing text', () => {
  const result = sanitizeFlowNodesForSave([
    {
      id: 'message-1',
      type: 'messageNode',
      data: {
        messageType: 'text',
        text: '',
        buttons: [{ title: '   ', payload: '' }],
      },
    },
  ]);

  assert.equal(result.changed, true);
  assert.deepEqual(result.autoFilledNodeIds, []);
  assert.deepEqual(result.nodes[0].data.buttons, []);
  assert.equal(result.nodes[0].data.text, '');
});
