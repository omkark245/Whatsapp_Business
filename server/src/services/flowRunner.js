const fs = require('fs');
const path = require('path');
const { Flow, FlowSession, Message } = require('../models');
const MetaService = require('./metaService');
const { emitNewMessage } = require('../utils/socketEvents');
const { logBackgroundError, normalizeError } = require('../utils/errors');
const {
  buildReplyButtons,
  getReplyButtonValidationIssues,
  normalizeInteractiveBodyText,
} = require('../utils/flowInteractive');
const {
  resolveStoredUpload,
  resolveUploadAlias,
  UPLOAD_DIR,
  getUploadDefinition,
} = require('../utils/uploads');
const { MESSAGE_SENDER_SOURCES, withSenderMetadata } = require('../utils/messageSender');

const MAX_STEPS_PER_RUN = 20;
const FLOW_DEBUG = process.env.FLOW_DEBUG === 'true';
const DEFAULT_PUBLIC_API_BASE_URL = 'https://api.whatsapp.finlectechnologies.com';
const BUSINESS_PHONE_PLACEHOLDER = '{{business_phone}}';
const BUSINESS_WEBSITE_PLACEHOLDER = '{{business_website}}';
const BUSINESS_PHONE_FALLBACK = 'Phone support currently unavailable';
const BUSINESS_WEBSITE_FALLBACK = 'Website link currently unavailable';

function splitTerms(value = '') {
  return value
    .split(',')
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
}

function matchesTerms(text = '', value = '', matchType = 'contains') {
  const normalizedText = text.trim().toLowerCase();
  const terms = splitTerms(value);
  if (!normalizedText || terms.length === 0) return false;

  return terms.some((term) => (
    matchType === 'exact'
      ? normalizedText === term
      : normalizedText.includes(term)
  ));
}

function normalizeFlowData(flowData) {
  if (!flowData) return { nodes: [], edges: [] };
  if (typeof flowData === 'string') {
    try {
      const parsed = JSON.parse(flowData);
      return {
        nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
        edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      };
    } catch {
      return { nodes: [], edges: [] };
    }
  }

  return {
    nodes: Array.isArray(flowData.nodes) ? flowData.nodes : [],
    edges: Array.isArray(flowData.edges) ? flowData.edges : [],
  };
}

function isFlowTriggered(flow, incomingText) {
  const flowData = normalizeFlowData(flow.flowData);
  const startNode = getStartNode(flowData);
  const triggerType = flow.triggerType || startNode?.data?.triggerType;
  const triggerValue = flow.triggerValue || startNode?.data?.triggerValue;

  if (triggerType === 'all' || startNode?.data?.triggerType === 'all') return true;
  if (triggerType === 'keyword') {
    return (
      matchesTerms(incomingText, triggerValue) ||
      matchesTerms(incomingText, startNode?.data?.triggerValue)
    );
  }
  return false;
}

function getNode(flowData, nodeId) {
  const data = normalizeFlowData(flowData);
  return data.nodes.find((node) => node.id === nodeId) || null;
}

function getOutgoingEdge(flowData, nodeId, handle = null) {
  const data = normalizeFlowData(flowData);
  return data.edges.find((edge) => (
    edge.source === nodeId && (!handle || edge.sourceHandle === handle)
  )) || null;
}

function getStartNode(flowData) {
  const data = normalizeFlowData(flowData);
  return data.nodes.find((node) => node.type === 'startNode') || data.nodes[0] || null;
}

function hasBusinessContactPlaceholders(text = '') {
  const value = String(text || '');
  return value.includes(BUSINESS_PHONE_PLACEHOLDER) || value.includes(BUSINESS_WEBSITE_PLACEHOLDER);
}

function normalizeBusinessWebsite(value = '') {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue;
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(rawValue)) {
    return `https://${rawValue}`;
  }

  return '';
}

function getValidBusinessWebsite(profile = null) {
  const websites = Array.isArray(profile?.websites) ? profile.websites : [];
  return websites
    .map((website) => normalizeBusinessWebsite(website))
    .find(Boolean) || '';
}

async function resolveBusinessContactDetails(waAccount, runtimeContext = {}, meta = null) {
  if (runtimeContext.businessContactDetails) {
    return runtimeContext.businessContactDetails;
  }

  const details = {
    phone: String(waAccount?.phoneNumber || '').trim() || BUSINESS_PHONE_FALLBACK,
    website: BUSINESS_WEBSITE_FALLBACK,
  };

  if (meta) {
    try {
      const profileResponse = await meta.getBusinessProfile();
      const businessProfile = profileResponse?.data?.[0] || {};
      const website = getValidBusinessWebsite(businessProfile);
      if (website) {
        details.website = website;
      }
    } catch (error) {
      logBackgroundError('flow.businessProfile', error, { waAccountId: waAccount?.id });
    }
  }

  runtimeContext.businessContactDetails = details;
  return details;
}

async function applyVariables(text, contact, { waAccount = null, runtimeContext = {}, meta = null } = {}) {
  let resolvedText = String(text || '')
    .replace(/\{\{name\}\}/g, contact.name || 'there')
    .replace(/\{\{phone\}\}/g, contact.phone || '');

  if (!hasBusinessContactPlaceholders(resolvedText)) {
    return resolvedText;
  }

  const businessContactDetails = await resolveBusinessContactDetails(waAccount, runtimeContext, meta);

  resolvedText = resolvedText
    .replace(/\{\{business_phone\}\}/g, businessContactDetails.phone)
    .replace(/\{\{business_website\}\}/g, businessContactDetails.website);

  return resolvedText;
}

function withButtonHints(text, buttons = []) {
  const usableButtons = buttons
    .map((button) => button?.title)
    .filter(Boolean);

  if (usableButtons.length === 0) return text;

  return `${text}\n\nReply with:\n${usableButtons.map((title) => `- ${title}`).join('\n')}`;
}

function slugifyListRowId(value, sectionIndex, rowIndex) {
  const base = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180);
  return base ? `${base}_${sectionIndex}_${rowIndex}` : `row_${sectionIndex}_${rowIndex}`;
}

function buildListSections(listSections = []) {
  return listSections
    .map((section, sectionIndex) => {
      const rows = (section?.rows || section?.items || [])
        .map((row, rowIndex) => {
          const title = String(row?.title || row?.label || '').trim();
          if (!title) return null;

          return {
            id: String(row?.id || row?.payload || slugifyListRowId(title, sectionIndex, rowIndex)).slice(0, 200),
            title: title.slice(0, 24),
            ...(row?.description
              ? { description: String(row.description).slice(0, 72) }
              : {}),
          };
        })
        .filter(Boolean)
        .slice(0, 10);

      if (rows.length === 0) return null;

      return {
        title: String(section?.title || `Options ${sectionIndex + 1}`).slice(0, 24),
        rows,
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}

function withListHints(text, sections = []) {
  const rows = sections.flatMap((section) => section.rows || []);
  if (rows.length === 0) return text;

  return `${text}\n\nSelect one option:\n${rows.map((row) => `- ${row.title}`).join('\n')}`;
}

function getAccountCountryCode(waAccount) {
  const digits = String(waAccount?.phoneNumber || '').replace(/\D/g, '');
  if (digits.length <= 10) return '';
  return digits.slice(0, -10);
}

function normalizeRecipient(waAccount, contact) {
  const candidate = contact?.waId || contact?.phone || '';
  const digits = String(candidate || '').replace(/\D/g, '');
  if (!digits) return candidate;

  if (digits.length <= 10) {
    const cc = getAccountCountryCode(waAccount);
    return cc ? `${cc}${digits}` : digits;
  }

  return digits;
}

function buildRealtimeScope(waAccount, contact) {
  return {
    ownerUserId: waAccount?.userId || null,
    teamId: contact?.teamId || null,
    assignedUserId: contact?.assignedUserId || null,
  };
}

function resolveFlowStoredUpload(uploadReference) {
  const directMatch = resolveStoredUpload(uploadReference);
  if (directMatch) return directMatch;

  const aliasMatch = resolveUploadAlias(uploadReference);
  if (aliasMatch) return aliasMatch;

  const rawReference = String(uploadReference || '').trim();
  if (!/^https?:\/\//i.test(rawReference)) return null;

  try {
    const parsedUrl = new URL(rawReference);
    if (!parsedUrl.pathname.startsWith('/uploads/')) return null;

    const storedName = path.posix.basename(parsedUrl.pathname);
    if (parsedUrl.pathname !== `/uploads/${storedName}`) return null;

    const definition = getUploadDefinition(storedName);
    if (!definition) return null;

    const absolutePath = path.join(UPLOAD_DIR, storedName);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return null;

    return {
      storedName,
      absolutePath,
      relativePath: `/uploads/${storedName}`,
      kind: definition.kind,
      mimeType: definition.mimeType,
    };
  } catch {
    return null;
  }
}

function normalizePublicBaseUrl(value = '') {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  try {
    const parsedUrl = new URL(rawValue);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return '';
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');
    parsedUrl.search = '';
    parsedUrl.hash = '';
    return parsedUrl.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function getPublicApiBaseUrl() {
  return (
    normalizePublicBaseUrl(process.env.PUBLIC_API_BASE_URL) ||
    normalizePublicBaseUrl(DEFAULT_PUBLIC_API_BASE_URL)
  );
}

function normalizeUploadPath(uploadReference = '') {
  const rawReference = String(uploadReference || '').trim();
  if (rawReference.startsWith('/uploads/')) return rawReference;
  if (rawReference.startsWith('uploads/')) return `/${rawReference}`;
  if (/^https?:\/\//i.test(rawReference)) {
    try {
      const parsedUrl = new URL(rawReference);
      if (parsedUrl.pathname.startsWith('/uploads/')) return parsedUrl.pathname;
    } catch {
      return '';
    }
  }
  return '';
}

function isManagedUploadReference(uploadReference = '') {
  return Boolean(normalizeUploadPath(uploadReference));
}

function buildPublicMediaUrl(uploadReference = '') {
  const rawReference = String(uploadReference || '').trim();
  if (!rawReference) return '';

  if (/^https?:\/\//i.test(rawReference)) {
    try {
      const parsedUrl = new URL(rawReference);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) return '';
      if (parsedUrl.pathname.startsWith('/uploads/')) {
        const publicBaseUrl = getPublicApiBaseUrl();
        return publicBaseUrl ? `${publicBaseUrl}${parsedUrl.pathname}` : parsedUrl.toString();
      }
      return parsedUrl.toString();
    } catch {
      return '';
    }
  }

  const uploadPath = normalizeUploadPath(rawReference);
  if (!uploadPath) return '';

  const publicBaseUrl = getPublicApiBaseUrl();
  return publicBaseUrl ? `${publicBaseUrl}${uploadPath}` : '';
}

function createMediaReferenceError(expectedKind, mediaUrl) {
  const error = new Error(`Flow ${expectedKind} media URL must be a valid http(s) URL or stored /uploads file.`);
  error.code = 'FLOW_MEDIA_REFERENCE_INVALID';
  error.statusCode = 400;
  error.details = [{ field: 'mediaUrl', value: mediaUrl }];
  return error;
}

async function buildFlowMediaReference(meta, nodeData = {}, expectedKind = 'document') {
  const mediaUrl = String(nodeData?.mediaUrl || '').trim();
  if (!mediaUrl) {
    throw new Error(`Flow ${expectedKind} media is missing`);
  }

  const storedUpload = resolveFlowStoredUpload(mediaUrl);
  if (storedUpload) {
    if (storedUpload.kind !== expectedKind) {
      throw new Error(`Flow node media kind mismatch: expected ${expectedKind}, got ${storedUpload.kind}`);
    }

    const buffer = fs.readFileSync(storedUpload.absolutePath);
    const mediaId = await meta.uploadMediaFromBuffer(buffer, {
      filename: storedUpload.storedName,
      mimeType: storedUpload.mimeType,
    });

    return { id: mediaId };
  }

  const publicMediaUrl = buildPublicMediaUrl(mediaUrl);
  if (isManagedUploadReference(mediaUrl) && publicMediaUrl) {
    return { link: publicMediaUrl };
  }

  if (publicMediaUrl) {
    return { link: publicMediaUrl };
  }

  throw createMediaReferenceError(expectedKind, mediaUrl);
}

function isRecoverableMediaSendError(error) {
  const normalized = normalizeError(error);
  return ['FLOW_MEDIA_REFERENCE_INVALID', 'META_INVALID_PARAMETER'].includes(normalized.code);
}

function buildMediaFallbackText(baseText, nodeData = {}, messageType = 'media') {
  const publicMediaUrl = buildPublicMediaUrl(nodeData.mediaUrl);
  const fallbackLines = [];

  if (baseText) fallbackLines.push(baseText);
  if (publicMediaUrl) fallbackLines.push(`${messageType[0].toUpperCase()}${messageType.slice(1)}: ${publicMediaUrl}`);
  if (fallbackLines.length === 0) fallbackLines.push(`We are unable to send this ${messageType} right now.`);

  return fallbackLines.join('\n\n');
}

async function sendMediaMessageOrFallback({ meta, recipient, nodeData, baseText, messageType }) {
  try {
    if (messageType === 'image') {
      return {
        metaResponse: await meta.sendImageMessage(
          recipient,
          await buildFlowMediaReference(meta, nodeData, 'image'),
          baseText
        ),
        storedType: 'image',
        storedContent: baseText,
        storedMediaUrl: buildPublicMediaUrl(nodeData?.mediaUrl) || nodeData?.mediaUrl || null,
      };
    }

    if (messageType === 'video') {
      return {
        metaResponse: await meta.sendVideoMessage(
          recipient,
          await buildFlowMediaReference(meta, nodeData, 'video'),
          baseText
        ),
        storedType: 'video',
        storedContent: baseText,
        storedMediaUrl: buildPublicMediaUrl(nodeData?.mediaUrl) || nodeData?.mediaUrl || null,
      };
    }

    return {
      metaResponse: await meta.sendDocumentMessage(
        recipient,
        await buildFlowMediaReference(meta, nodeData, 'document'),
        nodeData?.filename || 'document',
        baseText
      ),
      storedType: 'document',
      storedContent: baseText,
      storedMediaUrl: buildPublicMediaUrl(nodeData?.mediaUrl) || nodeData?.mediaUrl || null,
    };
  } catch (error) {
    if (!isRecoverableMediaSendError(error)) throw error;

    const fallbackText = buildMediaFallbackText(baseText, nodeData, messageType);
    return {
      metaResponse: await meta.sendTextMessage(recipient, fallbackText),
      storedType: 'text',
      storedContent: fallbackText,
      storedMediaUrl: null,
      mediaFallback: true,
    };
  }
}

function inferMessageType(data = {}) {
  const explicit = String(data.messageType || data.mediaKind || '').toLowerCase();
  if (['image', 'video', 'document'].includes(explicit)) return explicit;

  const mimeType = String(data.mimeType || '').toLowerCase();
  const fileRef = String(data.filename || data.mediaUrl || '').toLowerCase();

  if (mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(fileRef)) return 'image';
  if (mimeType.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/.test(fileRef)) return 'video';
  if (data.mediaUrl) return 'document';
  return 'text';
}

function shouldPauseAfterMessage(node, nextNode) {
  const text = node.data?.text || '';

  return (
    nextNode?.type === 'conditionNode' ||
    /please send these details/i.test(text) ||
    /reply with your selected course/i.test(text) ||
    /reply with the course name/i.test(text)
  );
}

async function sendFlowText({ waAccount, contact, flow, node, io, runtimeContext = {} }) {
  const meta = new MetaService(waAccount.accessToken, waAccount.phoneNumberId);
  const recipient = normalizeRecipient(waAccount, contact);
  const baseText = await applyVariables(node.data?.text, contact, { waAccount, runtimeContext, meta });
  const interactiveText = normalizeInteractiveBodyText(baseText);
  const buttonDefs = buildReplyButtons(node.data?.buttons || []);
  const listSections = buildListSections(node.data?.listSections || []);
  const buttonTitles = buttonDefs.map((button) => ({ title: button.reply.title }));
  const content = withButtonHints(baseText, buttonTitles);
  const messageType = inferMessageType(node.data);
  const sentAt = new Date();

  if (FLOW_DEBUG) {
    console.log('Flow send:', {
      flowId: flow.id,
      nodeId: node.id,
      to: recipient,
      type: messageType,
      preview: content.slice(0, 120),
    });
  }

  let storedType = 'text';
  let storedContent = content;
  let storedMediaUrl = null;
  let metaResponse;

  if (listSections.length > 0) {
    metaResponse = await meta.sendListMessage(
      recipient,
      interactiveText || baseText,
      node.data?.listButtonText || 'Select',
      listSections,
      node.data?.footerText || ''
    );
    storedType = 'text';
    storedContent = withListHints(baseText, listSections);
    storedMediaUrl = null;
  } else if (messageType === 'image') {
    ({ metaResponse, storedType, storedContent, storedMediaUrl } = await sendMediaMessageOrFallback({
      meta,
      recipient,
      nodeData: node.data,
      baseText,
      messageType,
    }));
  } else if (messageType === 'video') {
    ({ metaResponse, storedType, storedContent, storedMediaUrl } = await sendMediaMessageOrFallback({
      meta,
      recipient,
      nodeData: node.data,
      baseText,
      messageType,
    }));
  } else if (messageType === 'document') {
    ({ metaResponse, storedType, storedContent, storedMediaUrl } = await sendMediaMessageOrFallback({
      meta,
      recipient,
      nodeData: node.data,
      baseText,
      messageType,
    }));
  } else {
    const buttonIssues = getReplyButtonValidationIssues(baseText, node.data?.buttons || [], buttonDefs);

    if (buttonDefs.length > 0 && buttonIssues.length === 0) {
      try {
        metaResponse = await meta.sendReplyButtons(recipient, interactiveText, buttonDefs);
      } catch (error) {
        const normalized = normalizeError(error);
        if (normalized.code !== 'META_INVALID_PARAMETER') {
          throw error;
        }

        metaResponse = await meta.sendTextMessage(recipient, content);
      }
      storedType = 'text';
      storedContent = content;
      storedMediaUrl = null;
    } else if (messageType === 'text') {
      if (buttonDefs.length > 0 && buttonIssues.length > 0 && FLOW_DEBUG) {
        console.warn('Flow button fallback:', {
          flowId: flow.id,
          nodeId: node.id,
          issues: buttonIssues,
        });
      }

      metaResponse = await meta.sendTextMessage(recipient, content);
      storedType = 'text';
      storedContent = content;
      storedMediaUrl = null;
    }
  }

  if (recipient && recipient !== contact.waId) {
    await contact.update({ waId: recipient });
  }

  await contact.update({ lastMessageAt: sentAt });

  const message = await Message.create({
    contactId: contact.id,
    waAccountId: waAccount.id,
    direction: 'outbound',
    type: storedType,
    content: storedContent,
    mediaUrl: storedMediaUrl,
    waMessageId: metaResponse?.messages?.[0]?.id || null,
    status: 'sent',
    metadata: {
      ...withSenderMetadata(null, MESSAGE_SENDER_SOURCES.FLOW),
      flow: true,
      flowId: flow.id,
      nodeId: node.id,
      filename: node.data?.filename || null,
    },
  });

  emitNewMessage(io, buildRealtimeScope(waAccount, contact), { message, contact });
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

  logBackgroundError('flow.runner', error, { waAccountId: waAccount?.id });
  return tokenExpired;
}

async function continueSession({ session, flow, waAccount, contact, incomingText, io, runtimeContext = {} }) {
  let currentNodeId = session.currentNode;
  let steps = 0;

  while (currentNodeId && steps < MAX_STEPS_PER_RUN) {
    steps += 1;
    const node = getNode(flow.flowData, currentNodeId);
    if (!node) break;

    if (node.type === 'startNode') {
      const nextEdge = getOutgoingEdge(flow.flowData, node.id);
      currentNodeId = nextEdge?.target || null;
      continue;
    }

    if (node.type === 'conditionNode') {
      const matched = matchesTerms(incomingText, node.data?.value, node.data?.matchType || 'contains');
      const nextEdge = getOutgoingEdge(flow.flowData, node.id, matched ? 'yes' : 'no');
      currentNodeId = nextEdge?.target || null;
      continue;
    }

    if (node.type === 'messageNode') {
      await sendFlowText({ waAccount, contact, flow, node, io, runtimeContext });

      const nextEdge = getOutgoingEdge(flow.flowData, node.id);
      if (!nextEdge) {
        await session.update({ status: 'completed', currentNode: null, completedAt: new Date() });
        return true;
      }

      const nextNode = getNode(flow.flowData, nextEdge.target);
      if (shouldPauseAfterMessage(node, nextNode)) {
        await session.update({ currentNode: nextEdge.target });
        return true;
      }

      currentNodeId = nextEdge.target;
      continue;
    }

    if (node.type === 'delayNode') {
      const nextEdge = getOutgoingEdge(flow.flowData, node.id);
      if (!nextEdge) {
        await session.update({ status: 'completed', currentNode: null, completedAt: new Date() });
        return true;
      }

      const seconds = Math.max(Number(node.data?.seconds) || 0, 0);
      await session.update({ currentNode: nextEdge.target });

      setTimeout(() => {
        continueSession({
          session,
          flow,
          waAccount,
          contact,
          incomingText: '',
          io,
          runtimeContext,
        }).catch((error) => logBackgroundError('flow.delayedStep', error, {
          flowId: flow.id,
          sessionId: session.id,
          contactId: contact.id,
        }));
      }, seconds * 1000);

      return true;
    }

    if (node.type === 'endNode') {
      await session.update({ status: 'completed', currentNode: null, completedAt: new Date() });
      return true;
    }

    const nextEdge = getOutgoingEdge(flow.flowData, node.id);
    currentNodeId = nextEdge?.target || null;
  }

  await session.update({ currentNode: currentNodeId });
  return true;
}

async function processFlows(waAccount, contact, incomingText, io) {
  try {
    if (waAccount.status && waAccount.status !== 'active') return true;

    const activeSession = await FlowSession.findOne({
      where: { contactId: contact.id, status: 'active' },
      include: [{ model: Flow, as: 'flow' }],
      order: [['updatedAt', 'DESC']],
    });

    if (activeSession?.flow) {
      if (!activeSession.flow.isActive || activeSession.flow.waAccountId !== waAccount.id) {
        await activeSession.update({ status: 'expired' });
      } else {
        return continueSession({
          session: activeSession,
          flow: activeSession.flow,
          waAccount,
          contact,
          incomingText,
          io,
          runtimeContext: {},
        });
      }
    }

    const flows = await Flow.findAll({
      where: { waAccountId: waAccount.id, isActive: true },
      order: [['updatedAt', 'DESC']],
    });

    const flow = flows.find((candidate) => isFlowTriggered(candidate, incomingText));
    if (!flow) return false;

    const startNode = getStartNode(flow.flowData);
    if (!startNode) return false;

    const session = await FlowSession.create({
      flowId: flow.id,
      contactId: contact.id,
      currentNode: startNode.id,
      data: {},
      status: 'active',
    });

    return continueSession({
      session,
      flow,
      waAccount,
      contact,
      incomingText,
      io,
      runtimeContext: {},
    });
  } catch (error) {
    const tokenExpired = await markTokenFailure(error, waAccount);
    return tokenExpired;
  }
}

module.exports = {
  processFlows,
  __test__: {
    applyVariables,
    buildFlowMediaReference,
    buildPublicMediaUrl,
    hasBusinessContactPlaceholders,
    normalizePublicBaseUrl,
    resolveBusinessContactDetails,
  },
};
