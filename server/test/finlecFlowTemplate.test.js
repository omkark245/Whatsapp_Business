const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFinlecBusinessEnquiryFlow } = require('../src/utils/finlecFlowTemplate');

function getNode(flowData, nodeId) {
  return flowData.nodes.find((node) => node.id === nodeId) || null;
}

function hasEdge(flowData, source, target, sourceHandle = undefined) {
  return flowData.edges.some((edge) => (
    edge.source === source &&
    edge.target === target &&
    (sourceHandle === undefined || edge.sourceHandle === sourceHandle)
  ));
}

test('Finlec Technologies flow uses dynamic business placeholders in follow-up messages', () => {
  const { flowData } = buildFinlecBusinessEnquiryFlow();

  assert.match(getNode(flowData, 'fee_offer')?.data?.text || '', /\{\{business_website\}\}/);
  assert.match(getNode(flowData, 'admission_process')?.data?.text || '', /\{\{business_phone\}\}/);
  assert.match(getNode(flowData, 'admission_process')?.data?.text || '', /\{\{business_website\}\}/);
  assert.match(getNode(flowData, 'confirm')?.data?.text || '', /\{\{business_phone\}\}/);
  assert.match(getNode(flowData, 'confirm')?.data?.text || '', /\{\{business_website\}\}/);
  assert.match(getNode(flowData, 'fee_offer_call_info')?.data?.text || '', /\{\{business_phone\}\}/);
  assert.match(getNode(flowData, 'confirm_website_info')?.data?.text || '', /\{\{business_website\}\}/);
});

test('Finlec Technologies flow routes call and website quick replies into follow-up message nodes', () => {
  const { flowData } = buildFinlecBusinessEnquiryFlow();
  const feeButtons = (getNode(flowData, 'fee_offer')?.data?.buttons || []).map((button) => button.title);
  const admissionButtons = (getNode(flowData, 'admission_process')?.data?.buttons || []).map((button) => button.title);
  const confirmButtons = (getNode(flowData, 'confirm')?.data?.buttons || []).map((button) => button.title);

  assert.deepEqual(feeButtons, ['Book Demo', 'Call Expert', 'View Website']);
  assert.deepEqual(admissionButtons, ['Book Demo', 'Call Expert', 'View Website']);
  assert.deepEqual(confirmButtons, ['Call Expert', 'View Website']);

  assert.equal(hasEdge(flowData, 'fee_offer', 'fee_offer_website_check'), true);
  assert.equal(hasEdge(flowData, 'fee_offer_website_check', 'fee_offer_website_info', 'yes'), true);
  assert.equal(hasEdge(flowData, 'fee_offer_call_check', 'fee_offer_call_info', 'yes'), true);

  assert.equal(hasEdge(flowData, 'admission_process', 'admission_website_check'), true);
  assert.equal(hasEdge(flowData, 'admission_website_check', 'admission_website_info', 'yes'), true);
  assert.equal(hasEdge(flowData, 'admission_call_check', 'admission_call_info', 'yes'), true);

  assert.equal(hasEdge(flowData, 'confirm', 'confirm_website_check'), true);
  assert.equal(hasEdge(flowData, 'confirm_website_check', 'confirm_website_info', 'yes'), true);
  assert.equal(hasEdge(flowData, 'confirm_call_check', 'confirm_call_info', 'yes'), true);
});
