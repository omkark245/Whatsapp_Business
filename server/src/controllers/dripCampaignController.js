const { Op } = require('sequelize');
const {
  DripCampaign,
  DripCampaignEnrollment,
  ContactGroup,
  Contact,
  Template,
  WaAccount,
  Message,
} = require('../models');
const MetaService = require('../services/metaService');
const {
  findOwnedWaAccount,
  findOwnedGroup,
  findOwnedDripCampaign,
} = require('../utils/ownership');
const { MESSAGE_SENDER_SOURCES, withSenderMetadata } = require('../utils/messageSender');
const { AppError, logBackgroundError } = require('../utils/errors');
const { buildTemplateMediaPreview } = require('../utils/templateMessagePreview');

async function ensureStepTemplatesBelongToAccount(waAccountId, steps = []) {
  for (const step of steps) {
    const template = await Template.findOne({
      where: { id: step.templateId, waAccountId },
    });
    if (!template) return false;
  }

  return true;
}

exports.getDripCampaigns = async (req, res) => {
  try {
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const campaigns = await DripCampaign.findAll({
      where: { waAccountId: account.id },
      include: [{ model: ContactGroup, as: 'group', attributes: ['name'] }],
      order: [['createdAt', 'DESC']],
    });
    res.json({ dripCampaigns: campaigns });
  } catch (error) {
    throw error;
  }
};

exports.createDripCampaign = async (req, res) => {
  try {
    const { name, groupId, steps = [] } = req.body;
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const group = await findOwnedGroup(req.authContext, groupId, {
      where: { waAccountId: account.id },
    });
    if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');

    const validTemplates = await ensureStepTemplatesBelongToAccount(account.id, steps);
    if (!validTemplates) {
      throw new AppError(400, 'DRIP_TEMPLATE_ACCOUNT_MISMATCH', 'One or more drip steps use a template from another account');
    }

    const campaign = await DripCampaign.create({
      waAccountId: account.id,
      name,
      groupId: group.id,
      steps,
    });
    res.status(201).json({ dripCampaign: campaign });
  } catch (error) {
    throw error;
  }
};

exports.updateDripCampaign = async (req, res) => {
  try {
    const campaign = await findOwnedDripCampaign(req.authContext, req.params.id);
    if (!campaign) throw new AppError(404, 'DRIP_CAMPAIGN_NOT_FOUND', 'Drip campaign not found');

    if (req.body.groupId) {
      const group = await findOwnedGroup(req.authContext, req.body.groupId, {
        where: { waAccountId: campaign.waAccountId },
      });
      if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
    }

    if (req.body.steps) {
      const validTemplates = await ensureStepTemplatesBelongToAccount(campaign.waAccountId, req.body.steps);
      if (!validTemplates) {
        throw new AppError(400, 'DRIP_TEMPLATE_ACCOUNT_MISMATCH', 'One or more drip steps use a template from another account');
      }
    }

    await campaign.update(req.body);
    res.json({ dripCampaign: campaign });
  } catch (error) {
    throw error;
  }
};

exports.activateDripCampaign = async (req, res) => {
  try {
    const campaign = await findOwnedDripCampaign(req.authContext, req.params.id, {
      include: [{ model: ContactGroup, as: 'group', include: [{ model: Contact, as: 'contacts' }] }],
    });
    if (!campaign) throw new AppError(404, 'DRIP_CAMPAIGN_NOT_FOUND', 'Drip campaign not found');
    if (!campaign.group) throw new AppError(400, 'DRIP_CAMPAIGN_GROUP_MISSING', 'Campaign group is missing');
    if (!campaign.steps?.length) throw new AppError(400, 'DRIP_CAMPAIGN_STEPS_REQUIRED', 'Campaign must have at least one step');

    const contacts = campaign.group.contacts || [];
    const now = new Date();
    const firstDelay = campaign.steps[0]?.delayMinutes || 0;
    const nextSend = new Date(now.getTime() + firstDelay * 60000);

    for (const contact of contacts) {
      await DripCampaignEnrollment.findOrCreate({
        where: { dripCampaignId: campaign.id, contactId: contact.id },
        defaults: {
          dripCampaignId: campaign.id,
          contactId: contact.id,
          currentStep: 0,
          nextSendAt: nextSend,
        },
      });
    }

    await campaign.update({ status: 'active', isActive: true });
    res.json({ dripCampaign: campaign, enrolledCount: contacts.length });
  } catch (error) {
    throw error;
  }
};

exports.pauseDripCampaign = async (req, res) => {
  try {
    const campaign = await findOwnedDripCampaign(req.authContext, req.params.id);
    if (!campaign) throw new AppError(404, 'DRIP_CAMPAIGN_NOT_FOUND', 'Drip campaign not found');
    await campaign.update({ status: 'paused', isActive: false });
    res.json({ dripCampaign: campaign });
  } catch (error) {
    throw error;
  }
};

exports.getDripCampaignStats = async (req, res) => {
  try {
    const campaign = await findOwnedDripCampaign(req.authContext, req.params.id, {
      include: [{
        model: DripCampaignEnrollment,
        as: 'enrollments',
        include: [{ model: Contact, as: 'contact', attributes: ['name', 'phone'] }],
      }],
    });
    if (!campaign) throw new AppError(404, 'DRIP_CAMPAIGN_NOT_FOUND', 'Drip campaign not found');

    const stats = {
      total: campaign.enrollments.length,
      active: campaign.enrollments.filter((enrollment) => enrollment.status === 'active').length,
      completed: campaign.enrollments.filter((enrollment) => enrollment.status === 'completed').length,
      cancelled: campaign.enrollments.filter((enrollment) => enrollment.status === 'cancelled').length,
    };

    res.json({ dripCampaign: campaign, stats });
  } catch (error) {
    throw error;
  }
};

exports.deleteDripCampaign = async (req, res) => {
  try {
    const campaign = await findOwnedDripCampaign(req.authContext, req.params.id);
    if (!campaign) throw new AppError(404, 'DRIP_CAMPAIGN_NOT_FOUND', 'Drip campaign not found');

    await DripCampaignEnrollment.destroy({ where: { dripCampaignId: campaign.id } });
    await campaign.destroy();
    res.json({ message: 'Deleted' });
  } catch (error) {
    throw error;
  }
};

exports.processDripSteps = async () => {
  try {
    const enrollments = await DripCampaignEnrollment.findAll({
      where: {
        status: 'active',
        nextSendAt: { [Op.lte]: new Date() },
      },
      include: [
        { model: DripCampaign, as: 'dripCampaign', where: { isActive: true } },
        { model: Contact, as: 'contact' },
      ],
    });

    for (const enrollment of enrollments) {
      const campaign = enrollment.dripCampaign;
      const step = campaign.steps[enrollment.currentStep];

      if (!step) {
        await enrollment.update({ status: 'completed', completedAt: new Date(), nextSendAt: null });
        continue;
      }

      try {
        const template = await Template.findOne({
          where: { id: step.templateId, waAccountId: campaign.waAccountId },
        });
        const account = await WaAccount.findByPk(campaign.waAccountId);
        if (!template || !account) continue;

        const meta = new MetaService(account.accessToken, account.phoneNumberId);
        const components = [];
        if (step.variablesMapping) {
          const bodyParams = Object.values(step.variablesMapping).map((field) => ({
            type: 'text',
            text: enrollment.contact[field] || field,
          }));
          if (bodyParams.length > 0) {
            components.push({ type: 'body', parameters: bodyParams });
          }
        }

        const metaResponse = await meta.sendTemplateMessage(
          enrollment.contact.waId,
          template.name,
          template.language,
          components
        );
        const sentAt = new Date();
        const templateMedia = buildTemplateMediaPreview(template);

        await Message.create({
          contactId: enrollment.contact.id,
          waAccountId: campaign.waAccountId,
          direction: 'outbound',
          type: 'template',
          content: template.name,
          mediaUrl: templateMedia?.mediaUrl || null,
          waMessageId: metaResponse.messages?.[0]?.id || null,
          status: 'sent',
          metadata: {
            ...withSenderMetadata(null, MESSAGE_SENDER_SOURCES.DRIP_CAMPAIGN),
            dripCampaignId: campaign.id,
            currentStep: enrollment.currentStep,
            templateId: template.id,
            ...(templateMedia ? { templateMedia } : {}),
          },
        });

        await enrollment.contact.update({ lastMessageAt: sentAt });

        const nextStep = enrollment.currentStep + 1;
        if (nextStep >= campaign.steps.length) {
          await enrollment.update({
            currentStep: nextStep,
            status: 'completed',
            completedAt: sentAt,
            nextSendAt: null,
          });
        } else {
          const nextDelay = campaign.steps[nextStep]?.delayMinutes || 0;
          const nextSend = new Date(Date.now() + nextDelay * 60000);
          await enrollment.update({ currentStep: nextStep, nextSendAt: nextSend });
        }
      } catch (err) {
        logBackgroundError('drip.step', err, {
          enrollmentId: enrollment.id,
          dripCampaignId: campaign.id,
          contactId: enrollment.contactId,
        });
      }
    }
  } catch (error) {
    logBackgroundError('drip.process', error);
    throw error;
  }
};
