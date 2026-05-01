const { Op } = require('sequelize');
const {
  sequelize,
  Contact,
  ContactGroup,
  ContactLabel,
  Message,
  FlowSession,
  CampaignMessage,
  DripCampaignEnrollment,
  Team,
  User,
} = require('../models');
const {
  findOwnedWaAccount,
  findOwnedGroup,
  findOwnedLabel,
  findOwnedContacts,
} = require('../utils/ownership');
const MetaService = require('../services/metaService');
const { emitNewMessage } = require('../utils/socketEvents');
const { applyGroupDefaultAssignment, normalizeAssignmentInput } = require('../utils/teamAccess');
const { AppError } = require('../utils/errors');
const { MESSAGE_SENDER_SOURCES, withSenderMetadata } = require('../utils/messageSender');
const {
  digitsOnly,
  canonicalPhone,
  phoneVariants,
  isValidIndianPhone,
  normalizeIndianPhone,
  normalizeIndianDisplayPhone,
} = require('../utils/phoneUtils');

function formatContactPhone(contact) {
  if (!contact) return contact;
  const raw = typeof contact.toJSON === 'function' ? contact.toJSON() : { ...contact };
  raw.phone = normalizeIndianDisplayPhone(digitsOnly(raw.phone || raw.waId || ''));
  return raw;
}

function sanitizeImportedText(value = '') {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .trim();
}

function resolveImportedPhone(row = {}) {
  return row.phone || row.contact || row.mobile || row.number || '';
}

/**
 * Assign label names to a contact, creating labels that don't exist yet.
 */
async function assignLabels(contact, rawLabels, waAccountId) {
  if (!rawLabels) return;
  const labelNames = rawLabels.split(',').map((l) => l.trim()).filter(Boolean);
  for (const labelName of labelNames) {
    const [label] = await ContactLabel.findOrCreate({
      where: { waAccountId, name: labelName },
      defaults: { waAccountId, name: labelName },
    });
    await contact.addLabel(label);
  }
}

/**
 * Import contacts from a CSV payload.
 *
 * Deduplication strategy
 * ─────────────────────
 * 1. Phone numbers are normalised to digits only.
 * 2. Within-file duplicates (same normalised number appearing more than
 *    once in the request) are skipped after the first occurrence.
 * 3. The database is queried for *all* phone-number variants so that
 *    `9876543210`, `919876543210`, and `+91 9876543210` all resolve to
 *    the same existing contact — matching the webhook handler behaviour.
 *
 * Request body
 * ────────────
 * {
 *   contacts:       [{ phone, name?, labels? }],
 *   updateExisting: boolean  (default true — update name when contact exists)
 *   groupId:        number   (optional — add all imported contacts to this group)
 * }
 *
 * Response
 * ────────
 * { imported, updated, skipped, duplicatesInFile, total, addedToGroup }
 */
exports.importContacts = async (req, res) => {
  try {
    if (req.authContext.isMember) {
      throw new AppError(403, 'ADMIN_ACCESS_REQUIRED', 'Only admins can import contacts');
    }

    const { contacts = [], updateExisting = true, groupId } = req.body;
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    // Validate group ownership if a groupId was supplied.
    let group = null;
    if (groupId) {
      group = await findOwnedGroup(req.authContext, groupId, { where: { waAccountId: account.id } });
      if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let duplicatesInFile = 0;

    // Collect every contact that was successfully processed so we can
    // bulk-add them to the group after the loop.
    const processedContacts = [];

    // Track canonical phone numbers already processed in this import batch
    // so that within-CSV duplicates are de-duped before hitting the DB.
    const seenInFile = new Set();

    let invalidCount = 0;

    for (const row of contacts) {
      const cleanName = sanitizeImportedText(row.name || '');
      const cleanLabels = sanitizeImportedText(row.labels || '');
      const rawPhone = sanitizeImportedText(resolveImportedPhone(row));
      // ── 1. Basic validation ─────────────────────────────────────────────
      if (!rawPhone) {
        skipped++;
        continue;
      }

      const digits = digitsOnly(rawPhone);
      if (!digits) {
        skipped++;
        continue;
      }

      // ── 1b. Indian phone number validation ─────────────────────────────
      const phoneCheck = isValidIndianPhone(digits);
      if (!phoneCheck.valid) {
        invalidCount++;
        skipped++;
        continue;
      }

      // ── 1c. Normalise to 91XXXXXXXXXX ──────────────────────────────────
      const normalizedWaId = normalizeIndianPhone(digits);
      const normalizedPhone = normalizeIndianDisplayPhone(digits);

      // ── 2. Within-file duplicate check ──────────────────────────────────
      const canonical = canonicalPhone(normalizedPhone);
      if (seenInFile.has(canonical)) {
        duplicatesInFile++;
        skipped++;
        continue;
      }
      seenInFile.add(canonical);

      // ── 3. Build all lookup variants (10-digit, 12-digit, etc.) ─────────
      const variants = phoneVariants(normalizedPhone);

      // ── 4. Search DB matching ANY variant in waId OR phone columns ───────
      const existing = await Contact.findOne({
        where: {
          waAccountId: account.id,
          [Op.or]: [
            { waId:  { [Op.in]: variants } },
            { phone: { [Op.in]: variants } },
          ],
        },
      });

      if (existing) {
        // ── 5a. Contact already exists ────────────────────────────────────
        if (updateExisting && cleanName && cleanName !== existing.name) {
          await existing.update({
            name: cleanName,
            phone: normalizedPhone,
            waId: normalizedWaId,
          });
        } else if (existing.phone !== normalizedPhone || existing.waId !== normalizedWaId) {
          await existing.update({
            phone: normalizedPhone,
            waId: normalizedWaId,
          });
        }
        await assignLabels(existing, cleanLabels, account.id);
        processedContacts.push(existing);
        updated++;
      } else {
        // ── 5b. New contact ───────────────────────────────────────────────
        const contact = await Contact.create({
          waAccountId: account.id,
          waId: normalizedWaId,
          phone: normalizedPhone,
          name: cleanName || normalizedPhone,
        });
        await assignLabels(contact, cleanLabels, account.id);
        processedContacts.push(contact);
        imported++;
      }
    }

    // ── 6. Add all processed contacts to the group (if requested) ──────────
    let addedToGroup = 0;
    if (group && processedContacts.length > 0) {
      await group.addContacts(processedContacts);
      addedToGroup = processedContacts.length;
      await applyGroupDefaultAssignment(group, processedContacts, req.authContext.userId);
    }

    res.json({ imported, updated, skipped, invalidCount, duplicatesInFile, total: contacts.length, addedToGroup });
  } catch (error) {
    throw error;
  }
};

exports.exportContacts = async (req, res) => {
  try {
    const { labelId, groupId } = req.query;
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const where = {
      waAccountId: account.id,
      ...(req.authContext.isMember ? { teamId: req.authContext.teamId } : {}),
    };
    let labelFilter = null;

    if (labelId) {
      const label = await findOwnedLabel(req.authContext, labelId, {
        where: { waAccountId: account.id },
      });
      if (!label) throw new AppError(404, 'LABEL_NOT_FOUND', 'Label not found');
      labelFilter = label.id;
    }

    let contacts;
    if (groupId) {
      const group = await findOwnedGroup(req.authContext, groupId, {
        where: { waAccountId: account.id },
        include: [{
          model: Contact,
          as: 'contacts',
          where,
          required: false,
          include: [{
            model: ContactLabel,
            as: 'labels',
            attributes: ['name'],
            ...(labelFilter ? { where: { id: labelFilter } } : {}),
          }],
        }],
      });

      if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
      contacts = group.contacts || [];
    } else {
      const include = [{ model: ContactLabel, as: 'labels', attributes: ['name'] }];
      if (labelFilter) {
        include[0].where = { id: labelFilter };
      }
      contacts = await Contact.findAll({ where, include, order: [['name', 'ASC']] });
    }

    const csvData = contacts.map((contact) => ({
      phone: normalizeIndianDisplayPhone(digitsOnly(contact.phone || contact.waId || '')),
      name: contact.name || '',
      waId: contact.waId,
      labels: contact.labels?.map((label) => label.name).join(', ') || '',
      lastMessageAt: contact.lastMessageAt || '',
    }));

    res.json({ contacts: csvData });
  } catch (error) {
    throw error;
  }
};

exports.createContact = async (req, res) => {
  try {
    if (req.authContext.isMember) {
      throw new AppError(403, 'ADMIN_ACCESS_REQUIRED', 'Only admins can create contacts');
    }

    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const rawPhone = String(req.body.phone || '').trim();
    const digits = digitsOnly(rawPhone);
    if (!digits) {
      throw new AppError(400, 'PHONE_REQUIRED', 'Phone number is required');
    }

    const phoneCheck = isValidIndianPhone(digits);
    if (!phoneCheck.valid) {
      throw new AppError(400, 'INVALID_PHONE_NUMBER', phoneCheck.reason || 'Invalid Indian phone number');
    }

    const normalizedWaId = normalizeIndianPhone(digits);
    const normalizedPhone = normalizeIndianDisplayPhone(digits);
    const variants = phoneVariants(normalizedPhone);
    const existing = await Contact.findOne({
      where: {
        waAccountId: account.id,
        [Op.or]: [
          { waId: { [Op.in]: variants } },
          { phone: { [Op.in]: variants } },
        ],
      },
    });

    if (existing) {
      throw new AppError(409, 'CONTACT_PHONE_DUPLICATE', 'A contact with this phone number already exists');
    }

    const name = sanitizeImportedText(req.body.name || '');
    const contact = await Contact.create({
      waAccountId: account.id,
      waId: normalizedWaId,
      phone: normalizedPhone,
      name: name || normalizedPhone,
    });

    if (typeof req.body.labels === 'string' && req.body.labels.trim()) {
      await assignLabels(contact, sanitizeImportedText(req.body.labels || ''), account.id);
    }

    const createdContact = await Contact.findByPk(contact.id, {
      include: [{ model: ContactLabel, as: 'labels', attributes: ['id', 'name', 'color'] }],
    });

    res.status(201).json({ contact: formatContactPhone(createdContact) });
  } catch (error) {
    throw error;
  }
};

exports.searchContacts = async (req, res) => {
  try {
    const {
      search,
      labelId,
      groupId,
      assignment,
      teamId,
      assignedUserId,
      hasMessages,
      sortBy = 'lastMessageAt',
      sortOrder = 'DESC',
    } = req.query;
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const sequelizeDialect = account.sequelize?.getDialect?.() || sequelize.getDialect?.() || '';
    const likeOp = sequelizeDialect === 'postgres' ? Op.iLike : Op.like;
    const where = {
      waAccountId: account.id,
      ...(req.authContext.isMember ? { teamId: req.authContext.teamId } : {}),
    };
    const normalizedSortBy = ['name', 'phone', 'lastMessageAt', 'createdAt'].includes(sortBy)
      ? sortBy
      : 'lastMessageAt';
    const normalizedSortOrder = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    let labelFilter = null;

    if (search) {
      where[Op.or] = [
        { name: { [likeOp]: `%${search}%` } },
        { phone: { [likeOp]: `%${search}%` } },
        { waId: { [likeOp]: `%${search}%` } },
      ];
    }

    if (hasMessages === 'true') {
      where.lastMessageAt = { [Op.ne]: null };
    } else if (hasMessages === 'false') {
      where.lastMessageAt = { [Op.eq]: null };
    }


    if (labelId) {
      const label = await findOwnedLabel(req.authContext, labelId, {
        where: { waAccountId: account.id },
      });
      if (!label) throw new AppError(404, 'LABEL_NOT_FOUND', 'Label not found');
      labelFilter = label.id;
    }

    if (!req.authContext.isMember) {
      if (assignment === 'unassigned') {
        where.teamId = { [Op.is]: null };
      } else if (teamId) {
        where.teamId = Number(teamId);
      }

      if (assignedUserId) {
        where.assignedUserId = Number(assignedUserId);
      }
    }

    const include = [{ model: ContactLabel, as: 'labels', attributes: ['id', 'name', 'color'] }];
    if (labelFilter) {
      include[0].where = { id: labelFilter };
    }
    include.push({ model: Team, as: 'team', attributes: ['id', 'name'] });
    include.push({ model: User, as: 'assignedUser', attributes: ['id', 'name', 'email'] });

    let contacts;
    if (groupId) {
      const group = await findOwnedGroup(req.authContext, groupId, {
        where: { waAccountId: account.id },
        include: [{
          model: Contact,
          as: 'contacts',
          where,
          include,
          required: false,
        }],
      });

      if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
      contacts = group.contacts || [];
    } else {
      contacts = await Contact.findAll({
        where,
        include: [
          ...include,
          {
            model: Message,
            as: 'messages',
            limit: 1,
            order: [['createdAt', 'DESC']],
            attributes: ['content', 'createdAt'],
          },
        ],
        order: [[normalizedSortBy, normalizedSortOrder]],
        subQuery: false,
      });
    }

    res.json({ contacts: contacts.map(formatContactPhone) });
  } catch (error) {
    throw error;
  }
};

exports.deleteContacts = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    if (req.authContext.isMember) {
      await transaction.rollback();
      throw new AppError(403, 'ADMIN_ACCESS_REQUIRED', 'Only admins can delete contacts');
    }

    const { contactIds = [] } = req.body;
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) {
      await transaction.rollback();
      throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
    }

    const ids = [...new Set(contactIds.map((id) => Number(id)).filter(Boolean))];
    if (ids.length === 0) {
      await transaction.rollback();
      throw new AppError(400, 'CONTACT_SELECTION_REQUIRED', 'Select at least one contact to delete');
    }

    const contacts = await Contact.findAll({
      where: { id: ids, waAccountId: account.id },
      attributes: ['id'],
      transaction,
    });

    const ownedIds = contacts.map((contact) => contact.id);
    if (ownedIds.length === 0) {
      await transaction.rollback();
      throw new AppError(404, 'CONTACT_NOT_FOUND', 'No matching contacts found');
    }

    await FlowSession.destroy({ where: { contactId: ownedIds }, transaction });
    await CampaignMessage.destroy({ where: { contactId: ownedIds }, transaction });
    await DripCampaignEnrollment.destroy({ where: { contactId: ownedIds }, transaction });
    await Message.destroy({ where: { contactId: ownedIds }, transaction });

    await sequelize.query(
      'DELETE FROM contact_label_assignments WHERE contact_id IN (:contactIds)',
      { replacements: { contactIds: ownedIds }, transaction }
    );
    await sequelize.query(
      'DELETE FROM contact_group_members WHERE contact_id IN (:contactIds)',
      { replacements: { contactIds: ownedIds }, transaction }
    );

    const deleted = await Contact.destroy({
      where: { id: ownedIds, waAccountId: account.id },
      transaction,
    });

    await transaction.commit();
    res.json({ deleted, skipped: ids.length - ownedIds.length });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

exports.updateContact = async (req, res) => {
  try {
    if (req.authContext.isMember) {
      throw new AppError(403, 'ADMIN_ACCESS_REQUIRED', 'Only admins can update contacts');
    }

    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const contact = await Contact.findOne({
      where: { id: req.params.contactId, waAccountId: account.id },
    });
    if (!contact) throw new AppError(404, 'CONTACT_NOT_FOUND', 'Contact not found');

    const name = typeof req.body.name === 'string' ? sanitizeImportedText(req.body.name) : contact.name;
    const rawPhone = typeof req.body.phone === 'string'
      ? req.body.phone.replace(/[^0-9]/g, '')
      : contact.phone;

    if (!rawPhone) throw new AppError(400, 'PHONE_REQUIRED', 'Phone number is required');

    // Validate as Indian mobile number
    const phoneCheck = isValidIndianPhone(rawPhone);
    if (!phoneCheck.valid) {
      throw new AppError(400, 'INVALID_PHONE_NUMBER', phoneCheck.reason || 'Invalid Indian phone number');
    }

    // Normalise to 91XXXXXXXXXX format
    const phone = normalizeIndianDisplayPhone(rawPhone);
    const waId = normalizeIndianPhone(rawPhone);

    const variants = phoneVariants(phone);
    const existing = await Contact.findOne({
      where: {
        waAccountId: account.id,
        id: { [Op.ne]: contact.id },
        [Op.or]: [
          { waId: { [Op.in]: variants } },
          { phone: { [Op.in]: variants } },
        ],
      },
    });

    if (existing) {
      throw new AppError(409, 'CONTACT_PHONE_DUPLICATE', 'A contact with this phone number already exists');
    }

    await contact.update({
      name: name || phone,
      phone,
      waId,
    });

    res.json({ contact: formatContactPhone(contact) });
  } catch (error) {
    throw error;
  }
};

exports.sendBulkMessage = async (req, res) => {
  try {
    if (req.authContext.isMember) {
      throw new AppError(403, 'ADMIN_ACCESS_REQUIRED', 'Only admins can send bulk messages');
    }

    const {
      contactIds = [],
      content = '',
      mediaUrl,
      mediaType,    // 'image' | 'video' | 'document'
      caption = '',
      mediaFilename = 'file',
    } = req.body;

    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
    if (account.status !== 'active') {
      throw new AppError(400, 'WHATSAPP_RECONNECT_REQUIRED', 'Reconnect this WhatsApp account before sending messages.');
    }

    // Validate payload
    const isMediaMessage = !!mediaType;
    if (isMediaMessage) {
      if (!['image', 'video', 'document'].includes(mediaType)) {
        throw new AppError(400, 'UNSUPPORTED_MESSAGE_MEDIA_TYPE', 'mediaType must be image, video, or document');
      }
      if (!mediaUrl) throw new AppError(400, 'MESSAGE_MEDIA_URL_REQUIRED', 'mediaUrl is required when mediaType is set');
    } else {
      const messageText = String(content).trim();
      if (!messageText) throw new AppError(400, 'MESSAGE_CONTENT_REQUIRED', 'Message content is required');
      if (messageText.length > 4096) throw new AppError(400, 'MESSAGE_CONTENT_TOO_LONG', 'Message content too long');
    }

    const ids = [...new Set(contactIds.map((id) => Number(id)).filter(Boolean))];
    if (ids.length === 0) throw new AppError(400, 'CONTACT_SELECTION_REQUIRED', 'Select at least one contact');

    const contacts = await Contact.findAll({
      where: { id: ids, waAccountId: account.id },
    });
    if (contacts.length === 0) throw new AppError(404, 'CONTACT_NOT_FOUND', 'No matching contacts found');

    const meta = new MetaService(account.accessToken, account.phoneNumberId);
    const io = req.app.get('io');
    let sentCount = 0;
    let failedCount = 0;
    const failures = [];

    for (const contact of contacts) {
      try {
        let metaResponse;
        let msgType;
        let msgContent;

        if (isMediaMessage) {
          const personalizedCaption = caption
            ? caption
                .replace(/\{\{name\}\}/g, contact.name || 'there')
                .replace(/\{\{phone\}\}/g, contact.phone || '')
            : undefined;

          if (mediaType === 'image') {
            metaResponse = await meta.sendImageMessage(contact.waId, mediaUrl, personalizedCaption);
            msgType = 'image';
            msgContent = personalizedCaption || '';
          } else if (mediaType === 'video') {
            metaResponse = await meta.sendVideoMessage(contact.waId, mediaUrl, personalizedCaption);
            msgType = 'video';
            msgContent = personalizedCaption || '';
          } else {
            metaResponse = await meta.sendDocumentMessage(contact.waId, mediaUrl, mediaFilename, personalizedCaption);
            msgType = 'document';
            msgContent = personalizedCaption || mediaFilename;
          }
        } else {
          const personalizedContent = String(content)
            .replace(/\{\{name\}\}/g, contact.name || 'there')
            .replace(/\{\{phone\}\}/g, contact.phone || '');
          metaResponse = await meta.sendTextMessage(contact.waId, personalizedContent);
          msgType = 'text';
          msgContent = personalizedContent;
        }

        const sentAt = new Date();
        const message = await Message.create({
          contactId: contact.id,
          waAccountId: account.id,
          direction: 'outbound',
          type: msgType,
          content: msgContent,
          waMessageId: metaResponse.messages?.[0]?.id || null,
          status: 'sent',
          metadata: {
            ...withSenderMetadata(null, MESSAGE_SENDER_SOURCES.SYSTEM, req.user),
            bulkMessage: true,
            ...(isMediaMessage ? { mediaUrl, mediaFilename } : {}),
          },
        });

        await contact.update({ lastMessageAt: sentAt });
        emitNewMessage(io, {
          ownerUserId: account.userId,
          teamId: contact.teamId,
          assignedUserId: contact.assignedUserId,
        }, { message, contact });
        sentCount += 1;
      } catch (error) {
        failedCount += 1;
        failures.push({
          contactId: contact.id,
          error: error.response?.data?.error?.message || error.response?.data?.message || error.message,
        });
      }
    }

    if (sentCount === 0 && failures.length > 0) {
      const firstError = failures[0].error || 'Failed to send message';
      const tokenExpired = /session has expired|error validating access token|access token/i.test(firstError);
      if (tokenExpired) await account.update({ status: 'inactive' });
      throw new AppError(
        tokenExpired ? 400 : 502,
        tokenExpired ? 'META_ACCESS_TOKEN_EXPIRED' : 'BULK_MESSAGE_SEND_FAILED',
        tokenExpired
          ? 'WhatsApp access token expired. Reconnect this account in Settings with a new permanent token.'
          : firstError,
        [{ sentCount, failedCount, failures }]
      );
    }

    res.json({ sentCount, failedCount, failures });
  } catch (error) {
    throw error;
  }
};

exports.updateAssignment = async (req, res) => {
  try {
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const contact = await Contact.findOne({
      where: { id: req.params.contactId, waAccountId: account.id },
    });
    if (!contact) throw new AppError(404, 'CONTACT_NOT_FOUND', 'Contact not found');

    const assignment = await normalizeAssignmentInput(
      req.authContext.ownerUserId,
      req.body.teamId,
      req.body.assignedUserId
    );

    await contact.update({
      teamId: assignment.teamId,
      assignedUserId: assignment.assignedUserId,
      assignedByUserId: req.authContext.userId,
    });

    const updated = await Contact.findByPk(contact.id, {
      include: [
        { model: Team, as: 'team', attributes: ['id', 'name'] },
        { model: User, as: 'assignedUser', attributes: ['id', 'name', 'email'] },
      ],
    });

    res.json({ contact: formatContactPhone(updated) });
  } catch (error) {
    throw error;
  }
};

exports.bulkAssign = async (req, res) => {
  try {
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const ids = [...new Set((req.body.contactIds || []).map((id) => Number(id)).filter(Boolean))];
    if (ids.length === 0) {
      throw new AppError(400, 'CONTACT_SELECTION_REQUIRED', 'Select at least one contact');
    }

    const contacts = await findOwnedContacts(req.authContext, ids, account.id);
    if (contacts.length !== ids.length) {
      throw new AppError(400, 'CONTACT_OWNERSHIP_MISMATCH', 'One or more contacts do not belong to this account');
    }

    const assignment = await normalizeAssignmentInput(
      req.authContext.ownerUserId,
      req.body.teamId,
      req.body.assignedUserId
    );

    await Contact.update({
      teamId: assignment.teamId,
      assignedUserId: assignment.assignedUserId,
      assignedByUserId: req.authContext.userId,
    }, {
      where: { id: ids, waAccountId: account.id },
    });

    res.json({ assignedCount: contacts.length });
  } catch (error) {
    throw error;
  }
};
