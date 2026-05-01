const assert = require('node:assert/strict');
const { test } = require('node:test');

const { __test__ } = require('../src/controllers/flowController');

test('resolveStarterFlowBuilder returns the built-in Finlec starter template', () => {
  const builder = __test__.resolveStarterFlowBuilder('finlec_business_enquiry');
  assert.equal(typeof builder, 'function');
});

test('resolveStarterFlowBuilder accepts normalized template keys only', () => {
  assert.equal(__test__.resolveStarterFlowBuilder('unknown_template'), null);
});
