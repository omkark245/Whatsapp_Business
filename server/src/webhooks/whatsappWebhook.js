const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { Contact, Message, WaAccount, AutoReply, CampaignMessage, Campaign, Flow } = require('../models');
const MetaService = require('../services/metaService');
const metaConfig = require('../config/meta');
const { autoAssignInboundContact } = require('../services/autoAssignmentService');
const { emitMessageStatus, emitNewMessage } = require('../utils/socketEvents');
const { processFlows } = require('../services/flowRunner');
const { digitsOnly, phoneVariants, normalizeIndianPhone, normalizeIndianDisplayPhone } = require('../utils/phoneUtils');
const { logBackgroundError } = require('../utils/errors');
const { MESSAGE_SENDER_SOURCES, withSenderMetadata } = require('../utils/messageSender');
const {
  UPLOAD_DIR,
  ensureUploadDir,
  getUploadDefinition,
  sanitizeStoredFilename,
  validateUploadBuffer,
} = require('../utils/uploads');

const TRACKED_STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);
const WEBHOOK_PATHS = ['/webhook', '/api/webhook', '/api/whatsapp/webhook'];
const FLOW_TEXT_TYPES = new Set(['text', 'interactive']);
const FLOW_DEBUG = process.env.FLOW_DEBUG === 'true';
const WEBHOOK_CONFIG_ERROR_REASONS = new Set(['app-secret-missing', 'app-secret-invalid']);
const AUTO_REPLY_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata';
const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function buildRealtimeScope(waAccount, contact = null) {
  return {
    ownerUserId: waAccount?.userId || null,
    teamId: contact?.teamId || null,
    assignedUserId: contact?.assignedUserId || null,
  };
}

async function resolveStatusScope(waAccount, trackedMessage, campaignMessage) {
  const contactId = trackedMessage?.contactId || campaignMessage?.contactId || null;
  if (!contactId) {
    return buildRealtimeScope(waAccount);
  }

  const contact = await Contact.findByPk(contactId, {
    attributes: ['id', 'teamId', 'assignedUserId'],
  });

  return buildRealtimeScope(waAccount, contact);
}

function normalizeStatus(status) {
  return TRACKED_STATUSES.has(status) ? status : null;
}

function getMetaAppSecret() {
  return String(process.env.META_APP_SECRET || metaConfig.appSecret || '').trim();
}

function looksLikeMetaAccessToken(secret) {
  return /^EAA[A-Za-z0-9]/.test(secret) && secret.length > 80;
}

function verifyWebhookSignature(req) {
  const appSecret = getMetaAppSecret();
  if (!appSecret) {
    return { ok: false, reason: 'app-secret-missing' };
  }

  if (looksLikeMetaAccessToken(appSecret)) {
    return { ok: false, reason: 'app-secret-invalid' };
  }

  const signatureHeader = String(req.get('x-hub-signature-256') || '').trim();
  if (!signatureHeader.startsWith('sha256=')) {
    return { ok: false, reason: 'signature-missing' };
  }

  if (!Buffer.isBuffer(req.rawBody) || req.rawBody.length === 0) {
    return { ok: false, reason: 'raw-body-missing' };
  }

  const expectedSignature = `sha256=${crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex')}`;
  const actualBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (actualBuffer.length !== expectedBuffer.length) {
    return { ok: false, reason: 'signature-mismatch' };
  }

  const isMatch = crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  return {
    ok: isMatch,
    reason: isMatch ? null : 'signature-mismatch',
  };
}

function getWebhookStatusFailureDetails(status) {
  const error = status?.errors?.[0] || {};
  const details = error.error_data?.details || error.details || error.message;
  const providerCode = error.code || error.error_subcode;
  const isMediaFetchForbidden =
    String(providerCode) === '131053' &&
    /downloading media from weblink failed|http code 403|forbidden/i.test(String(details || error.title || ''));
  const isMediaUploadError = String(providerCode) === '131053';

  return {
    errorMessage: isMediaFetchForbidden
      ? 'Meta could not download this template header media because the URL returned 403 Forbidden. Re-upload the media in this app or use a public unauthenticated HTTPS URL.'
      : isMediaUploadError
        ? details || 'Meta could not process the template header media. Re-upload the file as a standard supported media file or use a public HTTPS media URL from this app.'
        : details || error.title || 'Meta reported this message as failed',
    errorCode: providerCode ? [error.code, error.error_subcode].filter(Boolean).join('/') : null,
    failureSource: 'meta-webhook',
  };
}

function summarizeStatusErrors(errors = []) {
  return Array.isArray(errors)
    ? errors.map((error = {}) => ({
      code: error.code || error.error_subcode || null,
      title: error.title || null,
      message: error.message || null,
      details: error.error_data?.details || error.details || null,
    }))
    : [];
}

// digitsOnly and phoneVariants are imported from utils/phoneUtils

function contactMatchesVariants(contact, variants) {
  const values = [
    contact.waId,
    contact.phone,
    digitsOnly(contact.waId).slice(-10),
    digitsOnly(contact.phone).slice(-10),
  ].filter(Boolean);

  return values.some((value) => variants.includes(value));
}

function pickPreferredWebhookContact(contacts, variants) {
  return [...contacts].sort((a, b) => {
    const aPhone = digitsOnly(a.phone);
    const bPhone = digitsOnly(b.phone);
    const aScore = variants.includes(aPhone) && aPhone.length === 10 ? 2 : variants.includes(aPhone) ? 1 : 0;
    const bScore = variants.includes(bPhone) && bPhone.length === 10 ? 2 : variants.includes(bPhone) ? 1 : 0;

    if (aScore !== bScore) return bScore - aScore;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  })[0] || null;
}

async function resolveWebhookWaAccount(phoneNumberId) {
  if (!phoneNumberId) return null;

  const accounts = await WaAccount.findAll({
    where: { phoneNumberId },
    order: [
      ['updatedAt', 'DESC'],
      ['id', 'DESC'],
    ],
  });

  if (accounts.length <= 1) return accounts[0] || null;

  const activeAccounts = accounts.filter((account) => account.status === 'active');
  const candidates = activeAccounts.length > 0 ? activeAccounts : accounts;
  const candidateIds = candidates.map((account) => account.id);

  const activeFlow = await Flow.findOne({
    where: {
      waAccountId: { [Op.in]: candidateIds },
      isActive: true,
    },
    order: [
      ['updatedAt', 'DESC'],
      ['id', 'DESC'],
    ],
  });

  if (activeFlow) {
    return candidates.find((account) => account.id === activeFlow.waAccountId) || candidates[0];
  }

  const activeAutoReply = await AutoReply.findOne({
    where: {
      waAccountId: { [Op.in]: candidateIds },
      isActive: true,
    },
    order: [
      ['updatedAt', 'DESC'],
      ['id', 'DESC'],
    ],
  });

  if (activeAutoReply) {
    return candidates.find((account) => account.id === activeAutoReply.waAccountId) || candidates[0];
  }

  return candidates[0];
}

async function findOrCreateWebhookContact({ waAccount, waId, contactInfo }) {
  const variants = phoneVariants(waId);
  const profileName = contactInfo?.profile?.name;
  const normalizedWaId = normalizeIndianPhone(digitsOnly(waId));
  const normalizedPhone = normalizeIndianDisplayPhone(digitsOnly(waId));

  const directMatches = await Contact.findAll({
    where: {
      waAccountId: waAccount.id,
      [Op.or]: [
        { waId: { [Op.in]: variants } },
        { phone: { [Op.in]: variants } },
      ],
    },
    order: [['updatedAt', 'DESC']],
  });
  let contact = pickPreferredWebhookContact(directMatches, variants);

  if (!contact) {
    const candidates = await Contact.findAll({ where: { waAccountId: waAccount.id } });
    contact = pickPreferredWebhookContact(
      candidates.filter((candidate) => contactMatchesVariants(candidate, variants)),
      variants
    );
  }

  if (contact) {
    await contact.update({
      waId: normalizedWaId,
      phone: normalizedPhone,
      name: profileName || contact.name,
      lastMessageAt: new Date(),
    });
    return contact;
  }

  return Contact.create({
    waAccountId: waAccount.id,
    waId: normalizedWaId,
    phone: normalizedPhone,
    name: profileName || normalizedPhone,
    lastMessageAt: new Date(),
  });
}

function extractMessageContent(msg) {
  let content = '';
  let mediaId = null;
  let type = msg.type;

  switch (msg.type) {
    case 'text':
      content = msg.text?.body || '';
      break;
    case 'image':
      content = msg.image?.caption || '';
      mediaId = msg.image?.id;
      break;
    case 'video':
      content = msg.video?.caption || '';
      mediaId = msg.video?.id;
      break;
    case 'audio':
      mediaId = msg.audio?.id;
      break;
    case 'document':
      content = msg.document?.filename || '';
      mediaId = msg.document?.id;
      break;
    case 'sticker':
      mediaId = msg.sticker?.id;
      break;
    case 'location':
      content = JSON.stringify({
        latitude: msg.location?.latitude,
        longitude: msg.location?.longitude,
        name: msg.location?.name,
      });
      break;
    case 'reaction':
      content = msg.reaction?.emoji || '';
      break;
    case 'button':
      type = 'interactive';
      content = msg.button?.text || msg.button?.payload || '';
      break;
    case 'interactive':
      content =
        msg.interactive?.button_reply?.title ||
        msg.interactive?.button_reply?.id ||
        msg.interactive?.list_reply?.title ||
        msg.interactive?.list_reply?.id ||
        '';
      break;
    default:
      content = 'Unsupported message type';
      type = 'text';
  }

  return { content, mediaId, type };
}

function getExtensionFromMimeType(mimeType = '') {
  const normalizedMimeType = String(mimeType || '').trim().toLowerCase();

  const extensionByMimeType = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/avi': '.avi',
    'video/x-matroska': '.mkv',
    'video/mkv': '.mkv',
    'video/webm': '.webm',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'application/csv': '.csv',
  };

  return extensionByMimeType[normalizedMimeType] || '';
}

function getInboundMediaDescriptor(msg = {}) {
  const mediaEntry = msg?.[msg.type];
  if (!mediaEntry?.id) return null;

  if (!['image', 'video', 'document'].includes(msg.type)) {
    return null;
  }

  const mimeType = String(mediaEntry.mime_type || '').trim().toLowerCase();
  const fallbackExtension = getExtensionFromMimeType(mimeType);
  const fallbackFilename = `whatsapp-${msg.type}-${msg.id || Date.now()}${fallbackExtension}`;
  const filename = String(mediaEntry.filename || fallbackFilename).trim();
  const uploadDefinition = getUploadDefinition(filename, mimeType);

  if (!uploadDefinition) {
    return null;
  }

  return {
    mediaId: String(mediaEntry.id).trim(),
    filename,
    mimeType: uploadDefinition.mimeType,
    kind: uploadDefinition.kind,
    extension: uploadDefinition.extension,
  };
}

async function persistInboundMedia(meta, msg) {
  const descriptor = getInboundMediaDescriptor(msg);
  if (!descriptor?.mediaId) {
    return { mediaUrl: null, metadata: null };
  }

  try {
    const remoteMediaUrl = await meta.getMediaUrl(descriptor.mediaId);
    const buffer = Buffer.from(await meta.downloadMedia(remoteMediaUrl));

    if (!buffer.length || !validateUploadBuffer(buffer, descriptor)) {
      return { mediaUrl: null, metadata: null };
    }

    ensureUploadDir();

    const storedName = sanitizeStoredFilename(descriptor.filename, descriptor.extension);
    const relativePath = `/uploads/${storedName}`;
    const absolutePath = path.join(UPLOAD_DIR, storedName);

    fs.writeFileSync(absolutePath, buffer);

    return {
      mediaUrl: relativePath,
      metadata: {
        mediaUrl: relativePath,
        mediaFilename: descriptor.filename,
        mediaMimeType: descriptor.mimeType,
      },
    };
  } catch (error) {
    logBackgroundError('webhook.inboundMedia', error, {
      messageId: msg?.id,
      type: msg?.type,
      mediaId: descriptor.mediaId,
    });
    return { mediaUrl: null, metadata: null };
  }
}

function splitAutoReplyKeywords(value = '') {
  return String(value || '')
    .split(',')
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
}

function matchesAutoReplyKeyword(incomingText = '', keywordValue = '', matchType = 'contains') {
  const text = String(incomingText || '').trim().toLowerCase();
  const keywords = splitAutoReplyKeywords(keywordValue);
  if (!text || keywords.length === 0) return false;

  return keywords.some((keyword) => (
    matchType === 'exact'
      ? text === keyword
      : text.includes(keyword)
  ));
}

function getBusinessClock() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: AUTO_REPLY_TIMEZONE,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());

    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const hour = values.hour === '24' ? '00' : values.hour;

    return {
      day: WEEKDAY_INDEX[values.weekday] ?? new Date().getDay(),
      time: `${hour}:${values.minute}`,
    };
  } catch {
    const now = new Date();
    return {
      day: now.getDay(),
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    };
  }
}

function isAutoReplyDayAllowed(scheduleDays, currentDay) {
  return !Array.isArray(scheduleDays) || scheduleDays.length === 0 || scheduleDays.includes(currentDay);
}

async function refreshCampaignCounts(campaignId) {
  const messages = await CampaignMessage.findAll({
    where: { campaignId },
    attributes: ['contactId', 'status', 'createdAt', 'id'],
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

  const totals = [...latestByContact.values()].reduce((acc, message) => {
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
    totalMessages: latestByContact.size,
    sentCount: 0,
    deliveredCount: 0,
    readCount: 0,
    failedCount: 0,
  });

  await Campaign.update(totals, { where: { id: campaignId } });
}

const setupWebhook = (app, io) => {
  app.get(WEBHOOK_PATHS, (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === metaConfig.webhookVerifyToken) {
      console.log('Webhook verified');
      return res.status(200).send(challenge);
    }
    res.sendStatus(403);
  });

  app.post(WEBHOOK_PATHS, async (req, res) => {
    try {
      const signatureCheck = verifyWebhookSignature(req);
      if (!signatureCheck.ok) {
        console.warn('Rejected WhatsApp webhook', {
          requestId: req.requestId,
          reason: signatureCheck.reason,
        });
        return res.sendStatus(WEBHOOK_CONFIG_ERROR_REASONS.has(signatureCheck.reason) ? 503 : 403);
      }

      const body = req.body;
      if (FLOW_DEBUG) {
        console.log('Webhook POST received', {
          object: body?.object,
          entryCount: body?.entry?.length || 0,
          hasMessages: Boolean(body?.entry?.[0]?.changes?.some((c) => c.value?.messages)),
          hasStatuses: Boolean(body?.entry?.[0]?.changes?.some((c) => c.value?.statuses)),
        });
      }
      if (body.object !== 'whatsapp_business_account') return res.sendStatus(404);

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== 'messages') continue;
          const value = change.value;
          const phoneNumberId = value.metadata?.phone_number_id;

          const waAccount = await resolveWebhookWaAccount(phoneNumberId);
          if (!waAccount) continue;

          if (value.statuses) {
            for (const status of value.statuses) {
              const normalizedStatus = normalizeStatus(status.status);
              if (!normalizedStatus) continue;

              const trackedMessage = await Message.findOne({ where: { waMessageId: status.id } });
              let trackedFailureDetails = null;
              if (trackedMessage) {
                const failureDetails = normalizedStatus === 'failed'
                  ? getWebhookStatusFailureDetails(status)
                  : null;
                trackedFailureDetails = failureDetails;

                if (normalizedStatus === 'failed') {
                  console.error('Chat message failed by Meta webhook:', {
                    messageId: status.id,
                    localMessageId: trackedMessage.id,
                    errors: summarizeStatusErrors(status.errors),
                  });
                }

                await trackedMessage.update({
                  status: normalizedStatus,
                  ...(failureDetails
                    ? { metadata: { ...(trackedMessage.metadata || {}), failure: failureDetails } }
                    : {}),
                });
              }

              const campaignMessage = await CampaignMessage.findOne({
                where: { messageId: status.id },
              });

              if (campaignMessage && campaignMessage.status !== normalizedStatus) {
                if (normalizedStatus === 'failed') {
                  console.error('Campaign message failed by Meta webhook:', {
                    messageId: status.id,
                    campaignMessageId: campaignMessage.id,
                    errors: summarizeStatusErrors(status.errors),
                  });
                }
                await campaignMessage.update({
                  status: normalizedStatus,
                  ...(normalizedStatus === 'failed' ? getWebhookStatusFailureDetails(status) : {}),
                });
                await refreshCampaignCounts(campaignMessage.campaignId);
              }

              const statusScope = await resolveStatusScope(waAccount, trackedMessage, campaignMessage);
              emitMessageStatus(io, statusScope, {
                waMessageId: status.id,
                status: normalizedStatus,
                failure: trackedFailureDetails,
              });
            }
          }

          if (value.messages) {
            const inboundMeta = new MetaService(waAccount.accessToken, waAccount.phoneNumberId);
            for (const msg of value.messages) {
              const waId = msg.from;
              const contactInfo =
                value.contacts?.find((contact) => contact.wa_id === waId) ||
                value.contacts?.[0];

              const contact = await findOrCreateWebhookContact({
                waAccount,
                waId,
                contactInfo,
              });
              const { content, mediaId, type } = extractMessageContent(msg);
              const storedInboundMedia = await persistInboundMedia(inboundMeta, msg);
              const messageMetadata = {
                ...(msg.context ? { context: msg.context } : {}),
                ...(storedInboundMedia.metadata || {}),
              };

              const [message, created] = await Message.findOrCreate({
                where: { waMessageId: msg.id, waAccountId: waAccount.id },
                defaults: {
                  contactId: contact.id,
                  waAccountId: waAccount.id,
                  direction: 'inbound',
                  type,
                  content,
                  mediaUrl: storedInboundMedia.mediaUrl,
                  mediaId,
                  status: 'delivered',
                  metadata: Object.keys(messageMetadata).length > 0 ? messageMetadata : null,
                },
              });

              if (!created) continue;

              const scopedContact = await autoAssignInboundContact(contact.id) || contact;

              emitNewMessage(io, buildRealtimeScope(waAccount, scopedContact), { message, contact: scopedContact });

              if (FLOW_DEBUG) {
                  console.log('Webhook inbound:', {
                    waAccountId: waAccount.id,
                    contactId: scopedContact.id,
                    type,
                    content,
                  });
                }

              if (FLOW_TEXT_TYPES.has(type) && content) {
                const flowHandled = await processFlows(waAccount, scopedContact, content, io);
                if (FLOW_DEBUG) {
                  console.log('Flow handled:', {
                    waAccountId: waAccount.id,
                    contactId: scopedContact.id,
                    handled: flowHandled,
                  });
                }
                if (!flowHandled) {
                  await processAutoReplies(waAccount, scopedContact, content, io);
                }
              }
            }
          }
        }
      }

      res.sendStatus(200);
    } catch (error) {
      logBackgroundError('webhook.whatsapp', error, { requestId: req.requestId });
      res.sendStatus(200);
    }
  });
};

async function processAutoReplies(waAccount, contact, incomingText, io) {
  try {
    const autoReplies = await AutoReply.findAll({
      where: { waAccountId: waAccount.id, isActive: true },
      order: [['createdAt', 'ASC']],
    });

    if (autoReplies.length === 0) {
      if (FLOW_DEBUG) {
        console.log('Auto reply skipped: no active rules', {
          waAccountId: waAccount.id,
          contactId: contact.id,
        });
      }
      return;
    }

    const meta = new MetaService(waAccount.accessToken, waAccount.phoneNumberId);
    const { day: currentDay, time: currentTime } = getBusinessClock();
    let matchedAnyRule = false;

    for (const rule of autoReplies) {
      let shouldReply = false;

      if (rule.type === 'keyword') {
        shouldReply = matchesAutoReplyKeyword(incomingText, rule.keyword, rule.matchType || 'contains');
      } else if (rule.type === 'greeting') {
        if (!isAutoReplyDayAllowed(rule.scheduleDays, currentDay)) continue;
        if (rule.scheduleStart && rule.scheduleEnd) {
          shouldReply = currentTime >= rule.scheduleStart && currentTime <= rule.scheduleEnd;
        } else {
          shouldReply = true;
        }
      } else if (rule.type === 'away') {
        if (!isAutoReplyDayAllowed(rule.scheduleDays, currentDay)) continue;
        if (rule.scheduleStart && rule.scheduleEnd) {
          shouldReply = currentTime < rule.scheduleStart || currentTime > rule.scheduleEnd;
        } else {
          shouldReply = true;
        }
      }

      if (shouldReply) {
        matchedAnyRule = true;
        const replyText = rule.replyText
          .replace(/\{\{name\}\}/g, contact.name || 'there')
          .replace(/\{\{phone\}\}/g, contact.phone || '');
        const metaResponse = await meta.sendTextMessage(contact.waId, replyText);
        const sentAt = new Date();

        const message = await Message.create({
          contactId: contact.id,
          waAccountId: waAccount.id,
          direction: 'outbound',
          type: 'text',
          content: replyText,
          waMessageId: metaResponse.messages?.[0]?.id || null,
          status: 'sent',
          metadata: {
            ...withSenderMetadata(null, MESSAGE_SENDER_SOURCES.AUTO_REPLY),
            autoReply: true,
            autoReplyId: rule.id,
          },
        });

        await contact.update({ lastMessageAt: sentAt });

        emitNewMessage(io, buildRealtimeScope(waAccount, contact), { message, contact });

        if (rule.type === 'keyword') break;
      }
    }

    if (!matchedAnyRule && FLOW_DEBUG) {
      console.log('Auto reply skipped: no rule matched', {
        waAccountId: waAccount.id,
        contactId: contact.id,
        incomingText,
        currentDay,
        currentTime,
        timezone: AUTO_REPLY_TIMEZONE,
      });
    }
  } catch (error) {
    logBackgroundError('webhook.autoReply', error, {
      waAccountId: waAccount?.id,
      contactId: contact?.id,
    });
  }
}

module.exports = setupWebhook;
module.exports.verifyWebhookSignature = verifyWebhookSignature;
module.exports.resolveWebhookWaAccount = resolveWebhookWaAccount;
module.exports.getInboundMediaDescriptor = getInboundMediaDescriptor;
module.exports.persistInboundMedia = persistInboundMedia;
