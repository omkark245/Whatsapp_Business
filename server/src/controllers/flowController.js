const { Flow, FlowSession } = require('../models');
const { findOwnedWaAccount, findOwnedFlow } = require('../utils/ownership');
const { AppError } = require('../utils/errors');
const {
  sanitizeFlowInteractiveMessages,
  validateFlowInteractiveMessages,
} = require('../utils/flowInteractive');
const { buildFinlecBusinessEnquiryFlow } = require('../utils/finlecFlowTemplate');
const { buildItrootsCareerCounsellingFlow } = require('../utils/itrootsFlowTemplate');

const STARTER_FLOW_BUILDERS = {
  finlec_business_enquiry: buildFinlecBusinessEnquiryFlow,
  finlec_training: buildItrootsCareerCounsellingFlow,
};

function assertValidFlowData(flowData) {
  const details = validateFlowInteractiveMessages(flowData);
  if (details.length === 0) return;

  throw new AppError(
    400,
    'FLOW_INVALID_INTERACTIVE_MESSAGE',
    'Fix the invalid quick reply button messages before saving this flow.',
    details
  );
}

function resolveStarterFlowBuilder(templateKey = '') {
  return STARTER_FLOW_BUILDERS[String(templateKey || '').trim().toLowerCase()] || null;
}

async function buildStarterFlowPayload(accountId, templateKey) {
  const builder = resolveStarterFlowBuilder(templateKey);
  if (!builder) {
    throw new AppError(400, 'FLOW_TEMPLATE_NOT_FOUND', 'Starter flow template not found');
  }

  const basePayload = builder({ isActive: false });
  const safeFlowData = sanitizeFlowInteractiveMessages(basePayload.flowData || { nodes: [], edges: [] });
  assertValidFlowData(safeFlowData);

  const existingNames = await Flow.findAll({
    where: { waAccountId: accountId },
    attributes: ['name'],
  });
  const usedNames = new Set(existingNames.map((flow) => String(flow.name || '').trim()).filter(Boolean));
  const baseName = String(basePayload.name || 'Starter Flow').trim() || 'Starter Flow';
  let nextName = baseName;
  let suffix = 2;
  while (usedNames.has(nextName)) {
    nextName = `${baseName} (${suffix})`;
    suffix += 1;
  }

  return {
    waAccountId: accountId,
    name: nextName,
    triggerType: basePayload.triggerType || 'all',
    triggerValue: String(basePayload.triggerValue || '').trim(),
    flowData: safeFlowData,
    isActive: true,
  };
}

exports.getFlows = async (req, res) => {
  try {
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const flows = await Flow.findAll({
      where: { waAccountId: account.id },
      order: [['createdAt', 'DESC']],
    });
    res.json({ flows });
  } catch (error) {
    throw error;
  }
};

exports.getFlow = async (req, res) => {
  try {
    const flow = await findOwnedFlow(req.authContext, req.params.id);
    if (!flow) throw new AppError(404, 'FLOW_NOT_FOUND', 'Flow not found');
    res.json({ flow });
  } catch (error) {
    throw error;
  }
};

exports.createFlow = async (req, res) => {
  try {
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const { name, triggerType, triggerValue, flowData } = req.body;
    const safeFlowData = sanitizeFlowInteractiveMessages(flowData || { nodes: [], edges: [] });
    assertValidFlowData(safeFlowData);
    const flow = await Flow.create({
      waAccountId: account.id,
      name,
      triggerType,
      triggerValue,
      flowData: safeFlowData,
    });
    res.status(201).json({ flow });
  } catch (error) {
    throw error;
  }
};

exports.createStarterFlow = async (req, res) => {
  try {
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const payload = await buildStarterFlowPayload(account.id, req.body?.templateKey || 'finlec_business_enquiry');
    const flow = await Flow.create(payload);
    res.status(201).json({ flow });
  } catch (error) {
    throw error;
  }
};

exports.updateFlow = async (req, res) => {
  try {
    const flow = await findOwnedFlow(req.authContext, req.params.id);
    if (!flow) throw new AppError(404, 'FLOW_NOT_FOUND', 'Flow not found');
    const updatePayload = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(req.body, 'flowData')) {
      updatePayload.flowData = sanitizeFlowInteractiveMessages(req.body.flowData || { nodes: [], edges: [] });
      assertValidFlowData(updatePayload.flowData);
    }
    await flow.update(updatePayload);
    res.json({ flow });
  } catch (error) {
    throw error;
  }
};

exports.deleteFlow = async (req, res) => {
  try {
    const flow = await findOwnedFlow(req.authContext, req.params.id);
    if (!flow) throw new AppError(404, 'FLOW_NOT_FOUND', 'Flow not found');
    await FlowSession.destroy({ where: { flowId: flow.id } });
    await flow.destroy();
    res.json({ message: 'Flow deleted' });
  } catch (error) {
    throw error;
  }
};

exports.toggleFlow = async (req, res) => {
  try {
    const flow = await findOwnedFlow(req.authContext, req.params.id);
    if (!flow) throw new AppError(404, 'FLOW_NOT_FOUND', 'Flow not found');
    await flow.update({ isActive: !flow.isActive });
    res.json({ flow });
  } catch (error) {
    throw error;
  }
};

module.exports.__test__ = {
  resolveStarterFlowBuilder,
};
