const { Op } = require('sequelize');
const {
  Campaign,
  Message,
  Contact,
  Template,
  sequelize,
} = require('../models');
const { findOwnedWaAccount } = require('../utils/ownership');
const { AppError } = require('../utils/errors');

function normalizeMessageSource(message) {
  const metadata = message.metadata || {};

  if (metadata.campaignId) return 'campaigns';
  if (metadata.dripCampaignId) return 'dripCampaigns';
  if (metadata.flow) return 'flows';
  if (metadata.autoReply) return 'autoReplies';
  if (metadata.bulkMessage) return 'bulkSends';
  if (message.type === 'template') return 'templates';
  return 'chat';
}

function normalizeTemplateCategory(category) {
  const normalized = String(category || '').toUpperCase();

  if (['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(normalized)) {
    return normalized;
  }

  return 'UNKNOWN';
}

exports.getCampaignAnalytics = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const campaigns = await Campaign.findAll({
      where: { waAccountId: account.id, createdAt: { [Op.gte]: since } },
      attributes: [
        'id',
        'name',
        'status',
        'totalMessages',
        'sentCount',
        'deliveredCount',
        'readCount',
        'failedCount',
        'createdAt',
      ],
      order: [['createdAt', 'DESC']],
    });

    const totals = campaigns.reduce((acc, campaign) => ({
      totalCampaigns: acc.totalCampaigns + 1,
      totalMessages: acc.totalMessages + (campaign.totalMessages || 0),
      totalSent: acc.totalSent + (campaign.sentCount || 0),
      totalDelivered: acc.totalDelivered + (campaign.deliveredCount || 0),
      totalRead: acc.totalRead + (campaign.readCount || 0),
      totalFailed: acc.totalFailed + (campaign.failedCount || 0),
    }), {
      totalCampaigns: 0,
      totalMessages: 0,
      totalSent: 0,
      totalDelivered: 0,
      totalRead: 0,
      totalFailed: 0,
    });

    const msgDateExpr = sequelize.cast(sequelize.col('createdAt'), 'date');
    const dailyMessages = await Message.findAll({
      where: { waAccountId: account.id, createdAt: { [Op.gte]: since } },
      attributes: [
        [msgDateExpr, 'date'],
        'direction',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      group: [msgDateExpr, 'direction'],
      order: [[msgDateExpr, 'ASC']],
      raw: true,
    });

    const contactDateExpr = sequelize.cast(sequelize.col('createdAt'), 'date');
    const contactGrowth = await Contact.findAll({
      where: { waAccountId: account.id, createdAt: { [Op.gte]: since } },
      attributes: [
        [contactDateExpr, 'date'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      group: [contactDateExpr],
      order: [[contactDateExpr, 'ASC']],
      raw: true,
    });

    const totalContacts = await Contact.count({ where: { waAccountId: account.id } });

    res.json({
      campaignStats: totals,
      campaigns,
      dailyMessages,
      contactGrowth,
      totalContacts,
    });
  } catch (error) {
    throw error;
  }
};

exports.getUsageAnalytics = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
    const messages = await Message.findAll({
      where: {
        waAccountId: account.id,
        createdAt: { [Op.gte]: since },
      },
      attributes: ['id', 'direction', 'status', 'type', 'metadata', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });

    const outboundMessages = messages.filter((message) => message.direction === 'outbound');
    const inboundMessages = messages.filter((message) => message.direction === 'inbound');

    const templateIds = [
      ...new Set(
        outboundMessages
          .map((message) => message.metadata?.templateId)
          .filter(Boolean)
      ),
    ];

    const templates = templateIds.length > 0
      ? await Template.findAll({
        where: { id: templateIds, waAccountId: account.id },
        attributes: ['id', 'category'],
      })
      : [];

    const templateCategoryMap = templates.reduce((acc, template) => {
      acc[template.id] = normalizeTemplateCategory(template.category);
      return acc;
    }, {});

    const usageSummary = outboundMessages.reduce((acc, message) => {
      acc.totalOutbound += 1;

      if (message.status === 'sent') acc.queued += 1;
      if (['delivered', 'read'].includes(message.status)) acc.delivered += 1;
      if (message.status === 'read') acc.read += 1;
      if (message.status === 'failed') acc.failed += 1;
      if (message.type === 'template') {
        acc.templateMessages += 1;
        if (message.status === 'sent') acc.queuedTemplateMessages += 1;
      }

      return acc;
    }, {
      totalOutbound: 0,
      totalInbound: inboundMessages.length,
      queued: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      templateMessages: 0,
      queuedTemplateMessages: 0,
    });

    const sourceLabels = {
      chat: 'Chat',
      campaigns: 'Campaigns',
      dripCampaigns: 'Drip Campaigns',
      flows: 'Flows',
      autoReplies: 'Auto Replies',
      bulkSends: 'Bulk Sends',
      templates: 'Templates',
    };

    const sourceBreakdownMap = outboundMessages.reduce((acc, message) => {
      const sourceKey = normalizeMessageSource(message);
      if (!acc[sourceKey]) {
        acc[sourceKey] = {
          key: sourceKey,
          label: sourceLabels[sourceKey] || sourceKey,
          total: 0,
          queued: 0,
          delivered: 0,
          read: 0,
          failed: 0,
        };
      }

      acc[sourceKey].total += 1;
      if (message.status === 'sent') acc[sourceKey].queued += 1;
      if (['delivered', 'read'].includes(message.status)) acc[sourceKey].delivered += 1;
      if (message.status === 'read') acc[sourceKey].read += 1;
      if (message.status === 'failed') acc[sourceKey].failed += 1;

      return acc;
    }, {});

    const categoryBreakdownMap = outboundMessages.reduce((acc, message) => {
      if (message.type !== 'template') return acc;

      const category = normalizeTemplateCategory(templateCategoryMap[message.metadata?.templateId]);
      if (!acc[category]) {
        acc[category] = {
          category,
          total: 0,
          queued: 0,
          delivered: 0,
          read: 0,
          failed: 0,
        };
      }

      acc[category].total += 1;
      if (message.status === 'sent') acc[category].queued += 1;
      if (['delivered', 'read'].includes(message.status)) acc[category].delivered += 1;
      if (message.status === 'read') acc[category].read += 1;
      if (message.status === 'failed') acc[category].failed += 1;
      return acc;
    }, {});

    const dailyUsageMap = outboundMessages.reduce((acc, message) => {
      const dateKey = new Date(message.createdAt).toISOString().slice(0, 10);

      if (!acc[dateKey]) {
        acc[dateKey] = {
          date: dateKey,
          outbound: 0,
          queued: 0,
          delivered: 0,
          failed: 0,
        };
      }

      acc[dateKey].outbound += 1;
      if (message.status === 'sent') acc[dateKey].queued += 1;
      if (['delivered', 'read'].includes(message.status)) acc[dateKey].delivered += 1;
      if (message.status === 'failed') acc[dateKey].failed += 1;
      return acc;
    }, {});

    res.json({
      usageSummary,
      sourceBreakdown: Object.values(sourceBreakdownMap).sort((a, b) => b.total - a.total),
      categoryBreakdown: Object.values(categoryBreakdownMap).sort((a, b) => b.delivered - a.delivered),
      dailyUsage: Object.values(dailyUsageMap).sort((a, b) => a.date.localeCompare(b.date)),
      pricingNote: 'Meta pricing depends on the current rate card for your market. Use delivered template messages for cost estimates.',
    });
  } catch (error) {
    throw error;
  }
};
