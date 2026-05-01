const { Op, literal } = require('sequelize');
const { Contact, Message, Team, User, WaAccount } = require('../models');
const MetaService = require('../services/metaService');
const { emitNewMessage } = require('../utils/socketEvents');
const { findOwnedWaAccount, findOwnedContact } = require('../utils/ownership');
const { ensureTeamAccess } = require('../utils/teamAccess');
const { digitsOnly, normalizeIndianDisplayPhone } = require('../utils/phoneUtils');
const { MESSAGE_SENDER_SOURCES, withSenderMetadata } = require('../utils/messageSender');
const { AppError } = require('../utils/errors');
const { buildTemplateMediaPreviewFromComponents } = require('../utils/templateMessagePreview');

function formatContactPhone(contact) {
  if (!contact) return contact;
  const raw = typeof contact.toJSON === 'function' ? contact.toJSON() : { ...contact };
  raw.phone = normalizeIndianDisplayPhone(digitsOnly(raw.phone || raw.waId || ''));
  return raw;
}

function buildContactListWhere(account, authContext, search = '') {
  const accountIds = Array.isArray(account?.accountIds) && account.accountIds.length > 0
    ? account.accountIds.map((value) => Number(value)).filter(Boolean)
    : [Number(account.id)].filter(Boolean);
  const accountIdList = accountIds.join(', ');
  const where = {
    waAccountId: accountIds.length === 1 ? accountIds[0] : { [Op.in]: accountIds },
    id: {
      [Op.in]: literal(`(SELECT DISTINCT contact_id FROM messages WHERE wa_account_id IN (${accountIdList}))`),
    },
    ...(authContext.isMember ? { teamId: authContext.teamId } : {}),
  };

  if (search) {
    const sequelizeDialect = Contact.sequelize?.getDialect?.() || '';
    const likeOp = sequelizeDialect === 'postgres' ? Op.iLike : Op.like;
    where[Op.or] = [
      { name: { [likeOp]: `%${search}%` } },
      { phone: { [likeOp]: `%${search}%` } },
      { waId: { [likeOp]: `%${search}%` } },
    ];
  }

  return where;
}

async function getRelatedWaAccountIds(account) {
  const baseAccountId = Number(account?.id || 0);
  if (!baseAccountId) return [];

  const ownerUserId = Number(account?.userId || 0);
  const phoneNumberId = String(account?.phoneNumberId || '').trim();
  const wabaId = String(account?.wabaId || '').trim();

  if (!ownerUserId || (!phoneNumberId && !wabaId)) {
    return [baseAccountId];
  }

  const siblings = await WaAccount.findAll({
    where: {
      userId: ownerUserId,
      [Op.or]: [
        ...(phoneNumberId ? [{ phoneNumberId }] : []),
        ...(wabaId ? [{ wabaId }] : []),
      ],
    },
    attributes: ['id'],
    order: [['updatedAt', 'DESC'], ['id', 'DESC']],
  });

  const ids = siblings.map((item) => Number(item.id)).filter(Boolean);
  if (!ids.includes(baseAccountId)) ids.unshift(baseAccountId);
  return [...new Set(ids)];
}

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const CUSTOMER_SERVICE_MESSAGE_TYPES = new Set(['text', 'image', 'document', 'video']);

async function assertCustomerServiceWindow(contact) {
  const lastInbound = await Message.findOne({
    where: { contactId: contact.id, direction: 'inbound' },
    order: [['createdAt', 'DESC']],
    attributes: ['id', 'createdAt'],
  });

  const lastInboundAt = lastInbound ? new Date(lastInbound.createdAt).getTime() : null;
  const hasOpenWindow = lastInboundAt && Date.now() - lastInboundAt <= CUSTOMER_SERVICE_WINDOW_MS;

  if (hasOpenWindow) return;

  throw new AppError(
    400,
    'WHATSAPP_REENGAGEMENT_REQUIRED',
    'Message failed because more than 24 hours have passed since the customer last replied. Use an approved template campaign to re-engage this customer.',
    [{
      lastInboundAt: lastInbound?.createdAt || null,
      action: 'send-approved-template',
    }]
  );
}

exports.getContacts = async (req, res) => {
  try {
    const { waAccountId } = req.params;
    const { search, page = 1, limit = 50 } = req.query;
    const account = await findOwnedWaAccount(req.authContext, waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
    account.accountIds = await getRelatedWaAccountIds(account);

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const where = buildContactListWhere(account, req.authContext, search);

    const { rows: contacts, count } = await Contact.findAndCountAll({
      where,
      order: [['lastMessageAt', 'DESC']],
      subQuery: false,
      limit: parseInt(limit, 10),
      offset,
      include: [
        { model: Message, as: 'messages', limit: 1, order: [['createdAt', 'DESC']] },
        { model: Team, as: 'team', attributes: ['id', 'name'] },
        { model: User, as: 'assignedUser', attributes: ['id', 'name'] },
      ],
    });

    res.json({
      contacts: contacts.map(formatContactPhone),
      pagination: {
        total: count,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(count / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    throw error;
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { contactId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const contact = await findOwnedContact(req.authContext, contactId, {
      include: [
        { model: Team, as: 'team', attributes: ['id', 'name'] },
        { model: User, as: 'assignedUser', attributes: ['id', 'name'] },
      ],
    });
    if (!contact) throw new AppError(404, 'CONTACT_NOT_FOUND', 'Contact not found');
    ensureTeamAccess(req.authContext, contact.teamId, 'chat');

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const { rows, count } = await Message.findAndCountAll({
      where: { contactId: contact.id },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
      offset,
    });
    const messages = rows.reverse();

    res.json({
      messages,
      pagination: {
        total: count,
        page: parseInt(page, 10),
        pages: Math.ceil(count / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    throw error;
  }
};

exports.sendMessage = async (req, res) => {
  let contact;

  try {
    const { contactId } = req.params;
    const {
      type = 'text',
      content,
      mediaUrl,
      templateName,
      templateLanguage,
      templateComponents,
    } = req.body;

    contact = await findOwnedContact(req.authContext, contactId, {
      waAccountAttributes: ['id', 'userId', 'accessToken', 'phoneNumberId'],
      include: [
        { model: Team, as: 'team', attributes: ['id', 'name'] },
        { model: User, as: 'assignedUser', attributes: ['id', 'name'] },
      ],
    });
    if (!contact) throw new AppError(404, 'CONTACT_NOT_FOUND', 'Contact not found');
    ensureTeamAccess(req.authContext, contact.teamId, 'chat');

    if (CUSTOMER_SERVICE_MESSAGE_TYPES.has(type)) {
      await assertCustomerServiceWindow(contact);
    }

    const meta = new MetaService(contact.waAccount.accessToken, contact.waAccount.phoneNumberId);
    let metaResponse;

    switch (type) {
      case 'text':
        metaResponse = await meta.sendTextMessage(contact.waId, content);
        break;
      case 'image':
        metaResponse = await meta.sendImageMessage(contact.waId, mediaUrl, content);
        break;
      case 'document':
        metaResponse = await meta.sendDocumentMessage(contact.waId, mediaUrl, req.body.filename, content);
        break;
      case 'video':
        metaResponse = await meta.sendVideoMessage(contact.waId, mediaUrl, content);
        break;
      case 'template':
        metaResponse = await meta.sendTemplateMessage(
          contact.waId,
          templateName,
          templateLanguage,
          templateComponents
        );
        break;
      default:
        throw new AppError(400, 'UNSUPPORTED_MESSAGE_TYPE', 'Unsupported message type');
    }

    const templateMedia = type === 'template'
      ? buildTemplateMediaPreviewFromComponents(templateComponents, mediaUrl)
      : null;

    const message = await Message.create({
      contactId: contact.id,
      waAccountId: contact.waAccountId,
      direction: 'outbound',
      type,
      content,
      mediaUrl: type === 'template' ? (templateMedia?.mediaUrl || mediaUrl || null) : mediaUrl,
      waMessageId: metaResponse.messages?.[0]?.id,
      status: 'sent',
      metadata: withSenderMetadata(
        templateMedia ? { templateMedia } : null,
        MESSAGE_SENDER_SOURCES.MANUAL_CHAT,
        req.user,
      ),
    });

    console.log('Chat message accepted by Meta:', {
      contactId: contact.id,
      to: contact.waId,
      type,
      waMessageId: metaResponse.messages?.[0]?.id || null,
    });

    await contact.update({ lastMessageAt: new Date() });

    const io = req.app.get('io');
    emitNewMessage(io, {
      ownerUserId: contact.waAccount.userId,
      teamId: contact.teamId,
      assignedUserId: contact.assignedUserId,
    }, { message, contact });

    res.status(201).json({ message });
  } catch (error) {
    const providerCode = error.response?.data?.error?.code;
    const providerMessage =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      error.message;

    const tokenExpired =
      providerCode === 190 ||
      /session has expired|error validating access token|access token/i.test(providerMessage || '');

    if (tokenExpired && contact?.waAccount) {
      await contact.waAccount.update({ status: 'inactive' });
    }

    if (tokenExpired) {
      throw new AppError(
        401,
        'META_ACCESS_TOKEN_EXPIRED',
        'WhatsApp access token expired. Reconnect this account in Settings with a new permanent token.'
      );
    }

    if (!error.response && providerMessage) {
      throw new AppError(502, 'MESSAGE_SEND_FAILED', providerMessage);
    }

    throw error;
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { contactId } = req.params;
    const contact = await findOwnedContact(req.authContext, contactId, {
      waAccountAttributes: ['id', 'userId', 'accessToken', 'phoneNumberId'],
    });
    if (!contact) throw new AppError(404, 'CONTACT_NOT_FOUND', 'Contact not found');
    ensureTeamAccess(req.authContext, contact.teamId, 'chat');

    const lastMsg = await Message.findOne({
      where: { contactId: contact.id, direction: 'inbound' },
      order: [['createdAt', 'DESC']],
    });

    if (lastMsg?.waMessageId) {
      const meta = new MetaService(contact.waAccount.accessToken, contact.waAccount.phoneNumberId);
      await meta.markAsRead(lastMsg.waMessageId);
    }

    res.json({ success: true });
  } catch (error) {
    throw error;
  }
};

module.exports.__test__ = {
  buildContactListWhere,
  getRelatedWaAccountIds,
};
