const { AutoReply } = require('../models');
const { findOwnedWaAccount, findOwnedAutoReply } = require('../utils/ownership');
const { AppError } = require('../utils/errors');

exports.getAutoReplies = async (req, res) => {
  try {
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const replies = await AutoReply.findAll({
      where: { waAccountId: account.id },
      order: [['type', 'ASC'], ['createdAt', 'DESC']],
    });
    res.json({ autoReplies: replies });
  } catch (error) {
    throw error;
  }
};

exports.createAutoReply = async (req, res) => {
  try {
    const { type, keyword, matchType, replyText, scheduleStart, scheduleEnd, scheduleDays } = req.body;
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const reply = await AutoReply.create({
      waAccountId: account.id,
      type,
      keyword,
      matchType,
      replyText,
      scheduleStart,
      scheduleEnd,
      scheduleDays,
    });
    res.status(201).json({ autoReply: reply });
  } catch (error) {
    throw error;
  }
};

exports.updateAutoReply = async (req, res) => {
  try {
    const reply = await findOwnedAutoReply(req.authContext, req.params.id);
    if (!reply) throw new AppError(404, 'AUTO_REPLY_NOT_FOUND', 'Auto reply not found');
    await reply.update(req.body);
    res.json({ autoReply: reply });
  } catch (error) {
    throw error;
  }
};

exports.toggleAutoReply = async (req, res) => {
  try {
    const reply = await findOwnedAutoReply(req.authContext, req.params.id);
    if (!reply) throw new AppError(404, 'AUTO_REPLY_NOT_FOUND', 'Auto reply not found');
    await reply.update({ isActive: !reply.isActive });
    res.json({ autoReply: reply });
  } catch (error) {
    throw error;
  }
};

exports.deleteAutoReply = async (req, res) => {
  try {
    const reply = await findOwnedAutoReply(req.authContext, req.params.id);
    if (!reply) throw new AppError(404, 'AUTO_REPLY_NOT_FOUND', 'Auto reply not found');
    await reply.destroy();
    res.json({ message: 'Deleted' });
  } catch (error) {
    throw error;
  }
};
