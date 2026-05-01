const { QuickReply } = require('../models');
const { findOwnedWaAccount, findOwnedQuickReply } = require('../utils/ownership');
const { AppError } = require('../utils/errors');

exports.getQuickReplies = async (req, res) => {
  try {
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
    const includeInactive = req.authContext?.isAdmin && req.query.includeInactive === 'true';

    const replies = await QuickReply.findAll({
      where: {
        waAccountId: account.id,
        ...(includeInactive ? {} : { isActive: true }),
      },
      order: [['title', 'ASC']],
    });
    res.json({ quickReplies: replies });
  } catch (error) {
    throw error;
  }
};

exports.createQuickReply = async (req, res) => {
  try {
    const { title, shortcut, content } = req.body;
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const reply = await QuickReply.create({
      waAccountId: account.id,
      title,
      shortcut,
      content,
      isActive: true,
    });
    res.status(201).json({ quickReply: reply });
  } catch (error) {
    throw error;
  }
};

exports.updateQuickReply = async (req, res) => {
  try {
    const reply = await findOwnedQuickReply(req.authContext, req.params.id);
    if (!reply) throw new AppError(404, 'QUICK_REPLY_NOT_FOUND', 'Quick reply not found');
    const { title, shortcut, content } = req.body;
    await reply.update({ title, shortcut, content });
    res.json({ quickReply: reply });
  } catch (error) {
    throw error;
  }
};

exports.toggleQuickReply = async (req, res) => {
  try {
    const reply = await findOwnedQuickReply(req.authContext, req.params.id);
    if (!reply) throw new AppError(404, 'QUICK_REPLY_NOT_FOUND', 'Quick reply not found');
    await reply.update({ isActive: !reply.isActive });
    res.json({ quickReply: reply });
  } catch (error) {
    throw error;
  }
};

exports.deleteQuickReply = async (req, res) => {
  try {
    const reply = await findOwnedQuickReply(req.authContext, req.params.id);
    if (!reply) throw new AppError(404, 'QUICK_REPLY_NOT_FOUND', 'Quick reply not found');
    await reply.destroy();
    res.json({ message: 'Deleted' });
  } catch (error) {
    throw error;
  }
};
