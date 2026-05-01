const fs = require('fs');
const { Op } = require('sequelize');
const {
  Campaign,
  CampaignMessage,
  Template,
  ContactGroup,
  Contact,
  Message,
  WaAccount,
  Team,
  User,
} = require('../models');
const MetaService = require('../services/metaService');
const { emitNewMessage } = require('../utils/socketEvents');
const { digitsOnly, normalizeIndianPhone } = require('../utils/phoneUtils');
const {
  findOwnedWaAccount,
  findOwnedCampaign,
} = require('../utils/ownership');
const { ensureTeamAccess } = require('../utils/teamAccess');
const { AppError, logBackgroundError } = require('../utils/errors');
const { MESSAGE_SENDER_SOURCES, withSenderMetadata } = require('../utils/messageSender');
const { buildTemplateDisplayText, buildTemplateMediaPreview } = require('../utils/templateMessagePreview');
const { buildPublicUploadUrl, resolveLocalStoredUpload } = require('../utils/uploads');

class CampaignRunError extends Error {
  constructor(statusCode, message, code = 'CAMPAIGN_RUN_FAILED') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const CAMPAIGN_SEND_CONCURRENCY = Math.max(1, Number.parseInt(process.env.CAMPAIGN_SEND_CONCURRENCY || '10', 10) || 10);

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractPlaceholderIndexes(text = '') {
  return [...new Set(
    [...String(text || '').matchAll(/\{\{(\d+)\}\}/g)]
      .map((match) => Number(match[1]))
      .filter((value) => Number.isInteger(value) && value > 0)
  )].sort((a, b) => a - b);
}

function looksLikeHttpUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function isMetaSampleMediaReference(value = '') {
  const text = String(value || '').trim();
  if (!looksLikeHttpUrl(text)) return false;

  try {
    const parsedUrl = new URL(text);
    const host = String(parsedUrl.hostname || '').toLowerCase();
    return host === 'scontent.whatsapp.net' || host === 'lookaside.fbsbx.com';
  } catch {
    return false;
  }
}

function looksLikeUploadReference(value = '') {
  const text = String(value || '').trim();
  if (text.startsWith('/uploads/')) return true;

  if (!looksLikeHttpUrl(text)) return false;

  try {
    return new URL(text).pathname.startsWith('/uploads/');
  } catch {
    return false;
  }
}

function getHeaderMediaReference(template, variablesMapping) {
  return String(variablesMapping?.headerMediaUrl || template?.headerContent || '').trim();
}

function hasStoredUploadReference(value = '') {
  const text = String(value || '').trim();
  if (text.startsWith('/uploads/')) return true;
  if (!looksLikeHttpUrl(text)) return false;

  try {
    return new URL(text).pathname.startsWith('/uploads/');
  } catch {
    return false;
  }
}

function isReusableHeaderMediaReference(value = '') {
  const text = String(value || '').trim();
  if (!text || isMetaSampleMediaReference(text)) return false;
  return looksLikeUploadReference(text) || looksLikeHttpUrl(text);
}

function buildHeaderMediaRequirementMessage(template, mediaReference) {
  if (isMetaSampleMediaReference(mediaReference)) {
    return `Template header ${template.headerType} media is still using Meta sample media. Upload the ${template.headerType} in this app before sending.`;
  }

  if (hasStoredUploadReference(mediaReference)) {
    return `Template header ${template.headerType} upload is missing from this server. Re-upload the media in the campaign or update the template media before sending.`;
  }

  if (!looksLikeHttpUrl(mediaReference) && !looksLikeUploadReference(mediaReference)) {
    return `Template header ${template.headerType} media must be uploaded in the campaign or set to a public URL. Meta approval sample media cannot be reused for sending.`;
  }

  return `Template header ${template.headerType} media is required. Upload the media in this app or use a public URL.`;
}

function normalizeVariablesMapping(rawMapping = {}) {
  if (!rawMapping || typeof rawMapping !== 'object') {
    return { bodyParameters: [], headerMediaUrl: '' };
  }

  if (Array.isArray(rawMapping.bodyParameters) || rawMapping.headerMediaUrl || rawMapping.headerParameters) {
    return {
      bodyParameters: Array.isArray(rawMapping.bodyParameters) ? rawMapping.bodyParameters : [],
      headerMediaUrl: String(rawMapping.headerMediaUrl || '').trim(),
      headerParameters: Array.isArray(rawMapping.headerParameters) ? rawMapping.headerParameters : [],
    };
  }

  const bodyParameters = Object.entries(rawMapping)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, value]) => {
      if (value && typeof value === 'object') return value;
      return { source: 'contact', field: String(value || '').trim() };
    });

  return { bodyParameters, headerMediaUrl: '', headerParameters: [] };
}

function normalizeSendIntervalSeconds(value, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CampaignRunError(400, 'Send interval must be a whole number of seconds');
  }
  if (parsed > 3600) {
    throw new CampaignRunError(400, 'Send interval cannot exceed 3600 seconds');
  }

  return parsed;
}

function withHeaderMediaOverride(rawVariablesMapping, headerMediaUrl) {
  const normalized = normalizeVariablesMapping(rawVariablesMapping);
  if (headerMediaUrl === undefined) {
    return normalized;
  }

  return {
    ...normalized,
    headerMediaUrl: String(headerMediaUrl || '').trim(),
  };
}

function resolveMappedValue(parameter, contact) {
  if (!parameter || typeof parameter !== 'object') return '';

  if (parameter.source === 'static') {
    return String(parameter.value || '').trim();
  }

  if (parameter.source === 'contact') {
    return String(contact?.[parameter.field] || '').trim();
  }

  return String(parameter.value || '').trim();
}

function renderTemplateBody(templateBody, parameterValues = []) {
  return String(templateBody || '').replace(/\{\{(\d+)\}\}/g, (_, indexText) => {
    const index = Number(indexText) - 1;
    return parameterValues[index] || '';
  });
}

function finalizeCampaignVariablesMapping(template, rawVariablesMapping, headerMediaUrl) {
  const nextVariablesMapping = withHeaderMediaOverride(rawVariablesMapping, headerMediaUrl);
  const validatedVariablesMapping = validateCampaignTemplate(template, nextVariablesMapping);

  if (!['image', 'video', 'document'].includes(template?.headerType)) {
    return validatedVariablesMapping;
  }

  if (validatedVariablesMapping.headerMediaUrl) {
    return validatedVariablesMapping;
  }

  const templateHeaderMedia = String(template?.headerContent || '').trim();
  if (!isReusableHeaderMediaReference(templateHeaderMedia)) {
    return validatedVariablesMapping;
  }

  return {
    ...validatedVariablesMapping,
    headerMediaUrl: templateHeaderMedia,
  };
}

function validateCampaignTemplate(template, rawVariablesMapping) {
  const templateStatus = String(template?.status || '').toUpperCase();
  if (templateStatus && templateStatus !== 'APPROVED') {
    if (templateStatus === 'DELETED') {
      throw new CampaignRunError(400, 'This campaign template has been deleted. Select a new approved template before sending.');
    }
    throw new CampaignRunError(400, 'Only approved templates can be sent in campaigns.');
  }

  const variablesMapping = normalizeVariablesMapping(rawVariablesMapping);
  const bodyPlaceholders = extractPlaceholderIndexes(template?.body);

  if (bodyPlaceholders.length > 0) {
    for (const index of bodyPlaceholders) {
      const parameter = variablesMapping.bodyParameters[index - 1];
      const hasValue =
        parameter?.source === 'contact'
          ? Boolean(parameter?.field)
          : Boolean(String(parameter?.value || '').trim());

      if (!hasValue) {
        throw new CampaignRunError(400, `Template body variable {{${index}}} is not configured`);
      }
    }
  }

  if (template?.headerType === 'text' && extractPlaceholderIndexes(template.headerContent).length > 0) {
    throw new CampaignRunError(400, 'Templates with variable text headers are not supported in campaigns yet');
  }

  if (Array.isArray(template?.buttons) && template.buttons.some((button) => /\{\{\d+\}\}/.test(JSON.stringify(button)))) {
    throw new CampaignRunError(400, 'Templates with variable buttons are not supported in campaigns yet');
  }

  if (['image', 'video', 'document'].includes(template?.headerType)) {
    const mediaReference = getHeaderMediaReference(template, variablesMapping);
    if (isMetaSampleMediaReference(mediaReference)) {
      throw new CampaignRunError(400, buildHeaderMediaRequirementMessage(template, mediaReference));
    }

    if (!looksLikeHttpUrl(mediaReference) && !looksLikeUploadReference(mediaReference)) {
      throw new CampaignRunError(400, buildHeaderMediaRequirementMessage(template, mediaReference));
    }

    if (hasStoredUploadReference(mediaReference) && !resolveLocalStoredUpload(mediaReference)) {
      throw new CampaignRunError(400, buildHeaderMediaRequirementMessage(template, mediaReference));
    }
  }

  return variablesMapping;
}

function buildTemplatePayload(template, rawVariablesMapping, contact, { headerMediaParameter = null } = {}) {
  const variablesMapping = validateCampaignTemplate(template, rawVariablesMapping);
  const components = [];
  const bodyPlaceholders = extractPlaceholderIndexes(template?.body);
  const bodyParameterValues = bodyPlaceholders.map((index) => (
    resolveMappedValue(variablesMapping.bodyParameters[index - 1], contact)
  ));

  for (let i = 0; i < bodyParameterValues.length; i += 1) {
    if (!String(bodyParameterValues[i] || '').trim()) {
      throw new Error(`Missing value for template variable {{${bodyPlaceholders[i]}}} on contact ${contact?.name || contact?.phone || contact?.id}`);
    }
  }

  if (bodyParameterValues.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParameterValues.map((text) => ({ type: 'text', text })),
    });
  }

  if (['image', 'video', 'document'].includes(template?.headerType)) {
    components.push({
      type: 'header',
      parameters: [headerMediaParameter || {
        type: template.headerType,
        [template.headerType]: { link: getHeaderMediaReference(template, variablesMapping) },
      }],
    });
  }

  return {
    components,
    preview: renderTemplateBody(template?.body || template?.name || '', bodyParameterValues) || template?.name || '',
  };
}

function getFailureDetails(error) {
  const providerError = error.response?.data?.error || {};
  const responseData = error.response?.data;
  const responseSummary = responseData && typeof responseData === 'object'
    ? JSON.stringify(responseData)
    : responseData;
  const providerCode = providerError.code || providerError.error_subcode;
  const providerMessage = providerError.message || providerError.error_user_msg || '';
  const providerDetails = providerError.error_data?.details || error.response?.data?.details || '';
  const isMediaFetchForbidden =
    String(providerCode) === '131053' &&
    /downloading media from weblink failed|http code 403|forbidden/i.test(`${providerMessage} ${providerDetails}`);
  const isMediaUploadError = String(providerCode) === '131053';
  const isEcosystemEngagementBlock =
    String(providerCode) === '131049' ||
    /healthy ecosystem engagement/i.test(providerMessage);

  return {
    errorMessage:
      (isEcosystemEngagementBlock
        ? 'Meta chose not to deliver this marketing message to this recipient because of ecosystem engagement/frequency protections. Do not resend immediately; retry later with increasing delay or use a more relevant opted-in audience.'
        : null) ||
      (isMediaFetchForbidden
        ? 'Meta could not download the template header media URL because it returned 403 Forbidden. Upload the media in this app or use a public unauthenticated HTTPS URL.'
        : null) ||
      (isMediaUploadError
        ? 'Meta could not process the template header media. Re-upload the file as a standard supported media file or use a public HTTPS media URL from this app.'
        : null) ||
      providerError.message ||
      providerDetails ||
      providerError.error_user_msg ||
      error.response?.data?.message ||
      responseSummary ||
      error.message ||
      'Failed to send campaign message',
    errorCode: providerError.code || providerError.error_subcode ? [providerError.code, providerError.error_subcode].filter(Boolean).join('/') : null,
    failureSource: error.response?.data?.error ? 'meta' : 'local',
  };
}

async function buildHeaderMediaParameter(template, variablesMapping, meta) {
  if (!['image', 'video', 'document'].includes(template?.headerType)) return null;

  const mediaReference = getHeaderMediaReference(template, variablesMapping);
  const storedUpload = resolveLocalStoredUpload(mediaReference);
  const publicMediaUrl = buildPublicUploadUrl(storedUpload?.relativePath || mediaReference);

  if (storedUpload) {
    if (storedUpload.kind !== template.headerType) {
      throw new CampaignRunError(
        400,
        `Uploaded header media is a ${storedUpload.kind}, but this template requires ${template.headerType}.`
      );
    }

    if (publicMediaUrl) {
      return {
        type: template.headerType,
        [template.headerType]: { link: publicMediaUrl },
      };
    }

    const buffer = fs.readFileSync(storedUpload.absolutePath);
    const mediaId = await meta.uploadMediaFromBuffer(buffer, {
      filename: storedUpload.storedName,
      mimeType: storedUpload.mimeType,
    });

    return {
      type: template.headerType,
      [template.headerType]: { id: mediaId },
    };
  }

  if (!looksLikeHttpUrl(mediaReference)) {
    throw new CampaignRunError(400, buildHeaderMediaRequirementMessage(template, mediaReference));
  }

  return {
    type: template.headerType,
    [template.headerType]: { link: publicMediaUrl || mediaReference },
  };
}

async function getLatestCampaignMessages(campaignId, includeContact = false) {
  const include = includeContact
    ? [{ model: Contact, as: 'contact', attributes: ['name', 'phone'] }]
    : [];

  const messages = await CampaignMessage.findAll({
    where: { campaignId },
    include,
    order: [
      ['contactId', 'ASC'],
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
  });

  const latestByContact = new Map();
  for (const message of messages) {
    if (!latestByContact.has(message.contactId)) {
      latestByContact.set(message.contactId, message);
    }
  }

  return [...latestByContact.values()];
}

function normalizeRecipient(contact) {
  const candidate = contact?.waId || contact?.phone || '';
  const digits = digitsOnly(candidate);
  if (!digits) return '';
  return normalizeIndianPhone(digits);
}

async function markTokenFailure(error, waAccount) {
  const providerCode = error.response?.data?.error?.code;
  const providerMessage =
    error.response?.data?.error?.message ||
    error.response?.data?.message ||
    error.message;

  const tokenExpired =
    providerCode === 190 ||
    /session has expired|error validating access token|access token/i.test(providerMessage || '');

  if (tokenExpired) {
    await waAccount.update({ status: 'inactive' });
  }

  return tokenExpired;
}

async function refreshCampaignCounts(campaignId) {
  const latestMessages = await getLatestCampaignMessages(campaignId);
  const totals = latestMessages.reduce((acc, message) => {
    if (message.status === 'sent') {
      acc.sentCount += 1;
    }
    if (['delivered', 'read'].includes(message.status)) {
      acc.deliveredCount += 1;
    }
    if (message.status === 'read') {
      acc.readCount += 1;
    }
    if (message.status === 'failed') {
      acc.failedCount += 1;
    }
    return acc;
  }, {
    totalMessages: latestMessages.length,
    sentCount: 0,
    deliveredCount: 0,
    readCount: 0,
    failedCount: 0,
  });

  await Campaign.update(totals, { where: { id: campaignId } });
  return totals;
}

async function prepareCampaignSend(campaign, contacts, { account } = {}) {
  if (!campaign.template) throw new CampaignRunError(400, 'Campaign template is missing');
  if (!campaign.group) throw new CampaignRunError(400, 'Campaign group is missing');

  const waAccount = account || campaign.waAccount || await WaAccount.findByPk(campaign.waAccountId);
  if (!waAccount) throw new CampaignRunError(400, 'WhatsApp account is missing');
  if (waAccount.status && waAccount.status !== 'active') {
    throw new CampaignRunError(400, 'Reconnect this WhatsApp account before sending campaigns.');
  }
  if (!waAccount.accessToken || !waAccount.phoneNumberId) {
    throw new CampaignRunError(400, 'WhatsApp account credentials are incomplete');
  }

  if (contacts.length === 0) {
    throw new CampaignRunError(400, 'Campaign group has no contacts');
  }

  const normalizedVariablesMapping = validateCampaignTemplate(campaign.template, campaign.variablesMapping);
  const meta = new MetaService(waAccount.accessToken, waAccount.phoneNumberId);
  const headerMediaParameter = await buildHeaderMediaParameter(campaign.template, normalizedVariablesMapping, meta);

  return {
    waAccount,
    normalizedVariablesMapping,
    headerMediaParameter,
  };
}

async function sendCampaignToContacts(campaign, contacts, { account, io, prepared = null, skipInitialStatusUpdate = false } = {}) {
  const preparedState = prepared || await prepareCampaignSend(campaign, contacts, { account });
  const { waAccount, normalizedVariablesMapping, headerMediaParameter } = preparedState;
  const meta = new MetaService(waAccount.accessToken, waAccount.phoneNumberId);
  const sendIntervalSeconds = normalizeSendIntervalSeconds(campaign.sendIntervalSeconds, 0);
  const sendIntervalMs = sendIntervalSeconds * 1000;

  if (!skipInitialStatusUpdate) {
    await campaign.update({
      status: 'running',
      totalMessages: Math.max(campaign.totalMessages || 0, contacts.length),
    });
  }

  async function sendCampaignToContact(contact) {
    try {
      if (!contact.teamId && campaign.group?.teamId) {
        await contact.update({
          teamId: campaign.group.teamId,
          assignedUserId: campaign.group.assignedUserId || null,
          assignedByUserId: campaign.createdByUserId || null,
        });
      }

      const recipient = normalizeRecipient(contact);
      if (!recipient) {
        throw new Error('Contact is missing a valid WhatsApp number');
      }
      const { components, preview } = buildTemplatePayload(campaign.template, normalizedVariablesMapping, contact, {
        headerMediaParameter,
      });
      const templateDisplay = buildTemplateDisplayText(campaign.template, preview);
      const templateMedia = buildTemplateMediaPreview(campaign.template, normalizedVariablesMapping, headerMediaParameter);

      const metaResponse = await meta.sendTemplateMessage(
        recipient,
        campaign.template.name,
        campaign.template.language,
        components
      );
      const metaMessageId = metaResponse.messages?.[0]?.id || null;
      const sentAt = new Date();

      const message = await Message.create({
        contactId: contact.id,
        waAccountId: campaign.waAccountId,
        direction: 'outbound',
        type: 'template',
        content: templateDisplay,
        mediaUrl: templateMedia?.mediaUrl || null,
        waMessageId: metaMessageId,
        status: 'sent',
        metadata: {
          ...withSenderMetadata(null, MESSAGE_SENDER_SOURCES.CAMPAIGN, campaign.createdByUser),
          campaignId: campaign.id,
          templateId: campaign.templateId,
          templateName: campaign.template.name,
          preview,
          templateDisplay,
          ...(templateMedia ? { templateMedia } : {}),
          components,
        },
      });

      await CampaignMessage.create({
        campaignId: campaign.id,
        contactId: contact.id,
        messageId: metaMessageId,
        status: 'sent',
        sentAt,
      });

      if (recipient !== contact.waId) {
        await contact.update({ waId: recipient, lastMessageAt: sentAt });
      } else {
        await contact.update({ lastMessageAt: sentAt });
      }

      emitNewMessage(io, {
        ownerUserId: waAccount.userId,
        teamId: contact.teamId || campaign.group?.teamId || campaign.teamId,
        assignedUserId: contact.assignedUserId || campaign.group?.assignedUserId || null,
      }, { message, contact });

      return 'sent';
    } catch (sendError) {
      await markTokenFailure(sendError, waAccount);
      console.error(`Campaign send failed for contact ${contact.id}:`, sendError.response?.data || sendError.message);
      const failureDetails = getFailureDetails(sendError);
      await CampaignMessage.create({
        campaignId: campaign.id,
        contactId: contact.id,
        status: 'failed',
        ...failureDetails,
      });
      return 'failed';
    }
  }

  if (sendIntervalMs > 0) {
    let sentCount = 0;
    let failedCount = 0;

    for (let index = 0; index < contacts.length; index += 1) {
      const result = await sendCampaignToContact(contacts[index]);
      if (result === 'sent') {
        sentCount += 1;
      } else {
        failedCount += 1;
      }

      if (index < contacts.length - 1) {
        await wait(sendIntervalMs);
      }
    }

    const totals = await refreshCampaignCounts(campaign.id);
    await campaign.update({
      status: 'completed',
      ...totals,
    });

    return { campaign, sentCount, failedCount };
  }

  let nextIndex = 0;
  function getNextContact() {
    if (nextIndex >= contacts.length) return null;
    const contact = contacts[nextIndex];
    nextIndex += 1;
    return contact;
  }

  async function worker() {
    let sentCount = 0;
    let failedCount = 0;

    while (true) {
      const contact = getNextContact();
      if (!contact) break;

      const result = await sendCampaignToContact(contact);
      if (result === 'sent') {
        sentCount += 1;
      } else {
        failedCount += 1;
      }
    }

    return { sentCount, failedCount };
  }

  const workerCount = Math.min(CAMPAIGN_SEND_CONCURRENCY, contacts.length);
  const workerResults = await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  );
  const sentCount = workerResults.reduce((total, result) => total + result.sentCount, 0);
  const failedCount = workerResults.reduce((total, result) => total + result.failedCount, 0);

  const totals = await refreshCampaignCounts(campaign.id);
  await campaign.update({
    status: 'completed',
    ...totals,
  });

  return { campaign, sentCount, failedCount };
}

function queueCampaignExecution(label, campaign, contacts, options = {}) {
  setImmediate(async () => {
    try {
      await sendCampaignToContacts(campaign, contacts, {
        ...options,
        skipInitialStatusUpdate: true,
      });
    } catch (error) {
      logBackgroundError(label, error, { campaignId: campaign.id });
      await campaign.update({ status: 'cancelled' }).catch(() => {});
    }
  });
}

async function saveCampaignHeaderMediaOverride(campaign, headerMediaUrl) {
  const nextVariablesMapping = finalizeCampaignVariablesMapping(
    campaign.template,
    campaign.variablesMapping,
    headerMediaUrl
  );
  const previousVariablesMapping = normalizeVariablesMapping(campaign.variablesMapping);

  if (JSON.stringify(previousVariablesMapping) === JSON.stringify(nextVariablesMapping)) {
    return;
  }

  await campaign.update({ variablesMapping: nextVariablesMapping });
  campaign.setDataValue('variablesMapping', nextVariablesMapping);
}

async function executeCampaign(campaign, options = {}) {
  const contacts = campaign.group?.contacts || [];
  return sendCampaignToContacts(campaign, contacts, options);
}

exports.getCampaigns = async (req, res) => {
  try {
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const campaigns = await Campaign.findAll({
      where: {
        waAccountId: account.id,
        ...(req.authContext.isMember ? { teamId: req.authContext.teamId } : {}),
      },
      include: [
        {
          model: Template,
          as: 'template',
          attributes: ['id', 'name', 'status', 'headerType', 'headerContent', 'language', 'category', 'buttons'],
        },
        { model: ContactGroup, as: 'group', attributes: ['name', 'teamId', 'assignedUserId'] },
        { model: Team, as: 'team', attributes: ['id', 'name'] },
        { model: User, as: 'createdByUser', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    res.json({ campaigns });
  } catch (error) {
    throw error;
  }
};

exports.createCampaign = async (req, res) => {
  try {
    const { name, templateId, groupId, variablesMapping, scheduledAt, sendIntervalSeconds } = req.body;
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const template = await Template.findOne({ where: { id: templateId, waAccountId: account.id } });
    if (!template) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');
    const finalizedVariablesMapping = finalizeCampaignVariablesMapping(template, variablesMapping);

    let group = null;
    if (groupId) {
      group = await ContactGroup.findOne({
        where: {
          id: groupId,
          waAccountId: account.id,
          ...(req.authContext.isMember ? { teamId: req.authContext.teamId } : {}),
        },
      });
      if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
    }
    if (req.authContext.isMember && !group) {
      throw new AppError(400, 'MEMBER_GROUP_REQUIRED', 'Members can create campaigns only for assigned groups');
    }

    const normalizedSendIntervalSeconds = normalizeSendIntervalSeconds(sendIntervalSeconds, 0);

    const campaign = await Campaign.create({
      waAccountId: account.id,
      name,
      templateId: template.id,
      groupId: group?.id || null,
      teamId: group?.teamId || null,
      createdByUserId: req.authContext.userId,
      variablesMapping: finalizedVariablesMapping,
      scheduledAt: scheduledAt || null,
      sendIntervalSeconds: normalizedSendIntervalSeconds,
      status: scheduledAt ? 'scheduled' : 'draft',
    });

    res.status(201).json({ campaign });
  } catch (error) {
    throw error;
  }
};

exports.runCampaign = async (req, res) => {
  try {
    const campaign = await findOwnedCampaign(req.authContext, req.params.id, {
      include: [
        { model: Template, as: 'template' },
        { model: ContactGroup, as: 'group', include: [{ model: Contact, as: 'contacts' }] },
        { model: User, as: 'createdByUser', attributes: ['id', 'name'] },
      ],
    });
    if (!campaign) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
    ensureTeamAccess(req.authContext, campaign.teamId, 'campaign');
    if (campaign.status === 'running') {
      throw new CampaignRunError(409, 'Campaign is already running');
    }
    await saveCampaignHeaderMediaOverride(campaign, req.body?.headerMediaUrl);

    const account = await findOwnedWaAccount(req.authContext, campaign.waAccountId);
    const io = req.app.get('io');
    const contacts = campaign.group?.contacts || [];
    const prepared = await prepareCampaignSend(campaign, contacts, { account });
    await campaign.update({
      status: 'running',
      totalMessages: Math.max(campaign.totalMessages || 0, contacts.length),
    });
    queueCampaignExecution('campaign.run', campaign, contacts, { account, io, prepared });

    res.status(202).json({
      campaign,
      queued: true,
      queuedCount: contacts.length,
      sentCount: 0,
      failedCount: 0,
    });
  } catch (error) {
    throw error;
  }
};

exports.resendCampaign = async (req, res) => {
  try {
    const campaign = await findOwnedCampaign(req.authContext, req.params.id, {
      include: [
        { model: Template, as: 'template' },
        { model: ContactGroup, as: 'group', include: [{ model: Contact, as: 'contacts' }] },
        { model: User, as: 'createdByUser', attributes: ['id', 'name'] },
      ],
    });
    if (!campaign) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
    ensureTeamAccess(req.authContext, campaign.teamId, 'campaign');
    if (campaign.status === 'running') {
      throw new CampaignRunError(409, 'Campaign is already running');
    }
    if (!campaign.template) {
      throw new AppError(400, 'CAMPAIGN_TEMPLATE_MISSING', 'Reconnect or reselect the template before resending this campaign');
    }
    await saveCampaignHeaderMediaOverride(campaign, req.body?.headerMediaUrl);

    const latestMessages = await getLatestCampaignMessages(campaign.id);
    const failedContactIds = latestMessages
      .filter((message) => message.status === 'failed')
      .map((message) => message.contactId);

    const scope = failedContactIds.length > 0 ? 'failed' : 'all';
    const targetContacts = scope === 'failed'
      ? (campaign.group?.contacts || []).filter((contact) => failedContactIds.includes(contact.id))
      : (campaign.group?.contacts || []);

    if (targetContacts.length === 0) {
      throw new CampaignRunError(400, 'No contacts available to resend for this campaign');
    }

    const account = await findOwnedWaAccount(req.authContext, campaign.waAccountId);
    const io = req.app.get('io');
    const prepared = await prepareCampaignSend(campaign, targetContacts, { account });
    await campaign.update({
      status: 'running',
      totalMessages: Math.max(campaign.totalMessages || 0, targetContacts.length),
    });
    queueCampaignExecution('campaign.resend', campaign, targetContacts, { account, io, prepared });

    res.status(202).json({
      campaign,
      scope,
      queued: true,
      queuedCount: targetContacts.length,
      sentCount: 0,
      failedCount: 0,
    });
  } catch (error) {
    throw error;
  }
};

exports.processScheduledCampaigns = async (io) => {
  try {
    const campaigns = await Campaign.findAll({
      where: {
        status: 'scheduled',
        scheduledAt: { [Op.lte]: new Date() },
      },
      include: [
        { model: Template, as: 'template' },
        { model: ContactGroup, as: 'group', include: [{ model: Contact, as: 'contacts' }] },
        { model: WaAccount, as: 'waAccount' },
        { model: User, as: 'createdByUser', attributes: ['id', 'name'] },
      ],
      order: [['scheduledAt', 'ASC']],
    });

    for (const campaign of campaigns) {
      try {
        await executeCampaign(campaign, { account: campaign.waAccount, io });
      } catch (error) {
        logBackgroundError('scheduledCampaign', error, { campaignId: campaign.id });
        await campaign.update({ status: 'cancelled' });
      }
    }
  } catch (error) {
    logBackgroundError('processScheduledCampaigns.findDue', error);
  }
};

exports.getCampaignStats = async (req, res) => {
  try {
    const campaign = await findOwnedCampaign(req.authContext, req.params.id, {
      include: [
        {
          model: Template,
          as: 'template',
          attributes: ['id', 'name', 'status', 'headerType', 'headerContent', 'language', 'category', 'buttons'],
        },
        { model: ContactGroup, as: 'group', attributes: ['id', 'name', 'teamId', 'assignedUserId'] },
      ],
    });

    if (!campaign) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
    ensureTeamAccess(req.authContext, campaign.teamId, 'campaign');
    const campaignMessages = await getLatestCampaignMessages(campaign.id, true);
    campaign.setDataValue('campaignMessages', campaignMessages);
    res.json({ campaign });
  } catch (error) {
    throw error;
  }
};

exports.deleteCampaign = async (req, res) => {
  try {
    const campaign = await findOwnedCampaign(req.authContext, req.params.id);
    if (!campaign) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
    ensureTeamAccess(req.authContext, campaign.teamId, 'campaign');

    await CampaignMessage.destroy({ where: { campaignId: campaign.id } });
    await campaign.destroy();
    res.json({ message: 'Campaign deleted' });
  } catch (error) {
    throw error;
  }
};
