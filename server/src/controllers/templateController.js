const fs = require('fs');
const { Template, Campaign } = require('../models');
const MetaService = require('../services/metaService');
const { findOwnedWaAccount, findOwnedTemplate } = require('../utils/ownership');
const { AppError } = require('../utils/errors');
const { resolveStoredUpload } = require('../utils/uploads');

exports.getTemplates = async (req, res) => {
  try {
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const where = { waAccountId: account.id };
    if (req.authContext?.isMember) {
      where.status = 'APPROVED';
    }

    const templates = await Template.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });
    res.json({ templates });
  } catch (error) {
    throw error;
  }
};

exports.syncTemplates = async (req, res) => {
  try {
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const meta = new MetaService(account.accessToken, account.phoneNumberId);
    const metaTemplates = await meta.getTemplates(account.wabaId);
    const syncedTemplateKeys = new Set();

    for (const mt of metaTemplates.data || []) {
      if (mt.id) syncedTemplateKeys.add(`id:${mt.id}`);
      syncedTemplateKeys.add(`name:${mt.name}:${mt.language}`);

      const header = mt.components?.find((component) => component.type === 'HEADER');
      const body = mt.components?.find((component) => component.type === 'BODY');
      const footer = mt.components?.find((component) => component.type === 'FOOTER');
      const buttons = mt.components?.find((component) => component.type === 'BUTTONS');
      const normalizedHeaderType = normalizeHeaderType(header?.format);
      const metaHeaderContent = header?.text || header?.example?.header_handle?.[0] || null;
      const existingTemplate = await Template.findOne({
        where: mt.id
          ? { waAccountId: account.id, metaTemplateId: mt.id }
          : { waAccountId: account.id, name: mt.name, language: mt.language },
      });
      const shouldPreserveExistingMedia =
        existingTemplate &&
        ['image', 'video', 'document'].includes(normalizedHeaderType) &&
        isReusableSendMediaReference(existingTemplate.headerContent) &&
        !isReusableSendMediaReference(metaHeaderContent);
      const templatePayload = {
        waAccountId: account.id,
        metaTemplateId: mt.id,
        name: mt.name,
        language: mt.language,
        category: normalizeTemplateCategory(mt.category),
        headerType: normalizedHeaderType,
        headerContent: shouldPreserveExistingMedia ? existingTemplate.headerContent : metaHeaderContent,
        body: body?.text || '',
        footer: footer?.text || null,
        buttons: buttons?.buttons || null,
        status: normalizeTemplateStatus(mt.status),
      };

      if (existingTemplate) {
        await existingTemplate.update(templatePayload);
      } else {
        await Template.create(templatePayload);
      }
    }

    const localTemplates = await Template.findAll({ where: { waAccountId: account.id } });
    for (const template of localTemplates) {
      const stillExistsInMeta =
        (template.metaTemplateId && syncedTemplateKeys.has(`id:${template.metaTemplateId}`)) ||
        syncedTemplateKeys.has(`name:${template.name}:${template.language}`);

      if (!stillExistsInMeta && template.status !== 'DELETED') {
        await template.update({ status: 'DELETED' });
      }
    }

    const templates = await Template.findAll({ where: { waAccountId: account.id } });
    res.json({ templates, synced: metaTemplates.data?.length || 0, checked: localTemplates.length });
  } catch (error) {
    throw error;
  }
};

exports.createTemplate = async (req, res) => {
  try {
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const { name, language, category, headerType, headerContent, body, footer, buttons } = req.body;
    const normalizedButtons = normalizeTemplateButtons(buttons);
    const meta = new MetaService(account.accessToken, account.phoneNumberId);

    const components = [];
    if (headerType && headerType !== 'none') {
      const resolvedHeaderContent = await resolveTemplateHeaderContent(meta, headerType, headerContent, req);
      components.push({
        type: 'HEADER',
        format: headerType.toUpperCase(),
        ...(headerType === 'text'
          ? { text: resolvedHeaderContent }
          : { example: { header_handle: [resolvedHeaderContent] } }),
      });
    }
    components.push({ type: 'BODY', text: body });
    if (footer) components.push({ type: 'FOOTER', text: footer });
    if (normalizedButtons.length > 0) components.push({ type: 'BUTTONS', buttons: normalizedButtons });

    const metaRes = await meta.createTemplate(account.wabaId, { name, language, category, components });

    const template = await Template.create({
      waAccountId: account.id,
      metaTemplateId: metaRes.id,
      name,
      language,
      category,
      headerType: headerType || 'none',
      headerContent,
      body,
      footer,
      buttons: normalizedButtons.length > 0 ? normalizedButtons : null,
      status: metaRes.status || 'PENDING',
    });

    res.status(201).json({ template });
  } catch (error) {
    throw error;
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const template = await findOwnedTemplate(req.authContext, req.params.id);
    if (!template) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');

    const account = await findOwnedWaAccount(req.authContext, template.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    if (!template.metaTemplateId) {
      throw new AppError(400, 'TEMPLATE_META_ID_MISSING', 'Template has no Meta ID — sync first');
    }

    const { headerType, headerContent, body, footer, buttons, category } = req.body;
    const meta = new MetaService(account.accessToken, account.phoneNumberId);
    const requestedCategory = category ?? template.category;
    const categoryChanged = requestedCategory !== template.category;
    const buttonsWereProvided = Object.prototype.hasOwnProperty.call(req.body, 'buttons');
    const normalizedButtons = buttonsWereProvided ? normalizeTemplateButtons(buttons) : template.buttons;

    if (template.status === 'APPROVED' && categoryChanged) {
      throw new AppError(
        400,
        'APPROVED_TEMPLATE_CATEGORY_LOCKED',
        'Approved templates cannot change category. Create a new template for a different category.'
      );
    }

    const components = [];
    const hType = headerType ?? template.headerType;
    const hContent = headerContent ?? template.headerContent;
    if (hType && hType !== 'none') {
      const resolvedHeaderContent = await resolveTemplateHeaderContent(meta, hType, hContent, req);
      components.push({
        type: 'HEADER',
        format: hType.toUpperCase(),
        ...(hType === 'text'
          ? { text: resolvedHeaderContent }
          : { example: { header_handle: [resolvedHeaderContent] } }),
      });
    }
    components.push({ type: 'BODY', text: body ?? template.body });
    const ftr = footer ?? template.footer;
    if (ftr) components.push({ type: 'FOOTER', text: ftr });
    const btns = normalizedButtons;
    if (btns?.length > 0) components.push({ type: 'BUTTONS', buttons: btns });

    await meta.editTemplate(template.metaTemplateId, {
      components,
      ...(categoryChanged ? { category: requestedCategory } : {}),
    });

    // Update local record
    await template.update({
      headerType: hType || 'none',
      headerContent: hContent,
      body: body ?? template.body,
      footer: ftr || null,
      buttons: btns?.length > 0 ? btns : null,
      ...(categoryChanged ? { category: requestedCategory } : {}),
    });

    res.json({ template });
  } catch (error) {
    throw error;
  }
};

async function resolveTemplateHeaderContent(meta, headerType, headerContent, req) {
  if (!headerType || headerType === 'none') return null;

  if (headerType === 'text') {
    return headerContent;
  }

  if (!headerContent) {
    throw new AppError(400, 'TEMPLATE_HEADER_REQUIRED', `Header content is required for ${headerType} templates`);
  }

  if (looksLikeHttpUrl(headerContent) || String(headerContent || '').startsWith('/uploads/')) {
    const storedUpload = resolveStoredUpload(headerContent, {
      requestHost: req?.get?.('host'),
    });

    if (!storedUpload) {
      throw new AppError(
        400,
        'TEMPLATE_HEADER_UPLOAD_INVALID',
        'Upload the header media through this app before submitting the template.'
      );
    }

    const buffer = fs.readFileSync(storedUpload.absolutePath);
    return meta.uploadTemplateHeaderHandleFromBuffer(buffer, {
      filename: storedUpload.storedName,
      mimeType: storedUpload.mimeType,
    });
  }

  return headerContent;
}

function looksLikeHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function isMetaSampleMediaReference(value) {
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

function isReusableSendMediaReference(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (text.startsWith('/uploads/')) return true;
  return looksLikeHttpUrl(text) && !isMetaSampleMediaReference(text);
}

function normalizeTemplateButtons(buttons) {
  if (!buttons) return [];
  if (!Array.isArray(buttons)) {
    throw new AppError(400, 'TEMPLATE_BUTTONS_INVALID', 'Template buttons must be an array');
  }

  const normalizedButtons = buttons
    .filter((button) => button && (button.text || button.url))
    .map((button) => {
      const type = String(button.type || 'QUICK_REPLY').trim().toUpperCase();
      const text = String(button.text || '').trim();

      if (!text) {
        throw new AppError(400, 'TEMPLATE_BUTTON_TEXT_REQUIRED', 'Button text is required');
      }

      if (text.length > 25) {
        throw new AppError(400, 'TEMPLATE_BUTTON_TEXT_TOO_LONG', 'Button text must be 25 characters or fewer');
      }

      if (type === 'QUICK_REPLY') {
        return { type, text };
      }

      if (type === 'URL') {
        const url = String(button.url || '').trim();
        if (!/^https?:\/\//i.test(url)) {
          throw new AppError(400, 'TEMPLATE_BUTTON_URL_INVALID', 'URL buttons must start with http:// or https://');
        }
        return { type, text, url };
      }

      throw new AppError(400, 'TEMPLATE_BUTTON_TYPE_INVALID', 'Only quick reply and URL template buttons are supported');
    });

  if (normalizedButtons.length > 3) {
    throw new AppError(400, 'TEMPLATE_BUTTON_LIMIT_EXCEEDED', 'Add no more than 3 buttons to a template');
  }

  return normalizedButtons;
}

function normalizeHeaderType(format) {
  const normalized = String(format || 'none').toLowerCase();
  if (['text', 'image', 'video', 'document'].includes(normalized)) return normalized;
  return 'none';
}

function normalizeTemplateCategory(category) {
  const normalized = String(category || 'MARKETING').toUpperCase();
  if (['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(normalized)) return normalized;
  return 'MARKETING';
}

function normalizeTemplateStatus(status) {
  const normalized = String(status || 'PENDING').toUpperCase();
  if (['PENDING', 'APPROVED', 'REJECTED', 'DELETED'].includes(normalized)) return normalized;
  return 'PENDING';
}

exports.deleteTemplate = async (req, res) => {
  try {
    const template = await findOwnedTemplate(req.authContext, req.params.id);
    if (!template) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found');

    const account = await findOwnedWaAccount(req.authContext, template.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    // Attempt to delete from Meta — but don't block local removal if it fails
    let metaWarning = null;
    try {
      const meta = new MetaService(account.accessToken, account.phoneNumberId);
      await meta.deleteTemplate(account.wabaId, template.name, template.metaTemplateId);
    } catch (metaErr) {
      const metaError = metaErr.response?.data?.error?.message || metaErr.message;
      console.error('Meta delete failed (continuing with local delete):', metaError);
      metaWarning = metaError;
    }

    const linkedCampaignCount = await Campaign.count({ where: { templateId: template.id } });

    if (linkedCampaignCount > 0) {
      await template.update({ status: 'DELETED' });

      if (metaWarning) {
        return res.json({
          message: 'Template marked deleted locally and kept for campaign history. Meta deletion failed â€” it may still appear after re-sync.',
          warning: metaWarning,
        });
      }

      return res.json({
        message: 'Template marked deleted and kept for existing campaigns',
      });
    }

    // Remove the local record only when no campaigns depend on it
    await template.destroy();

    if (metaWarning) {
      return res.json({
        message: 'Template deleted locally. Meta deletion failed — it may still appear after re-sync.',
        warning: metaWarning,
      });
    }

    res.json({ message: 'Template deleted' });
  } catch (error) {
    throw error;
  }
};
