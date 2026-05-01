const { Contact, ContactGroup, Team, User } = require('../models');
const { sanitizeUser } = require('../utils/authContext');
const { AppError } = require('../utils/errors');

async function findOwnedTeam(ownerUserId, teamId) {
  if (!teamId) return null;
  return Team.findOne({ where: { id: teamId, ownerUserId } });
}

exports.getMembers = async (req, res) => {
  try {
    const members = await User.findAll({
      where: {
        ownerUserId: req.authContext.ownerUserId,
        role: 'member',
      },
      include: [{ model: Team, as: 'team', attributes: ['id', 'name', 'status'] }],
      order: [['createdAt', 'DESC']],
    });

    res.json({
      members: members.map((member) => ({
        ...sanitizeUser(member),
        team: member.team ? member.team.toJSON() : null,
      })),
    });
  } catch (error) {
    throw error;
  }
};

exports.createMember = async (req, res) => {
  try {
    const { name, email, password, teamId } = req.body;
    const existing = await User.findOne({ where: { email } });
    if (existing) throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'Email already registered');

    const team = await findOwnedTeam(req.authContext.ownerUserId, teamId);
    if (!team) throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');

    const member = await User.create({
      name,
      email,
      password,
      role: 'member',
      ownerUserId: req.authContext.ownerUserId,
      teamId: team.id,
      status: 'active',
      mustChangePassword: true,
    });

    const created = await User.findByPk(member.id, {
      include: [{ model: Team, as: 'team', attributes: ['id', 'name', 'status'] }],
    });

    res.status(201).json({
      member: {
        ...sanitizeUser(created),
        team: created.team ? created.team.toJSON() : null,
      },
    });
  } catch (error) {
    throw error;
  }
};

exports.updateMember = async (req, res) => {
  try {
    const member = await User.findOne({
      where: {
        id: req.params.id,
        ownerUserId: req.authContext.ownerUserId,
        role: 'member',
      },
    });
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');

    let nextTeamId = member.teamId;
    if (req.body.teamId !== undefined) {
      const team = await findOwnedTeam(req.authContext.ownerUserId, req.body.teamId);
      if (!team) throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
      nextTeamId = team.id;
    }

    await member.update({
      name: typeof req.body.name === 'string' ? req.body.name.trim() || member.name : member.name,
      email: typeof req.body.email === 'string' ? req.body.email.trim() || member.email : member.email,
      teamId: nextTeamId,
      status: typeof req.body.status === 'string' ? req.body.status : member.status,
    });

    const updated = await User.findByPk(member.id, {
      include: [{ model: Team, as: 'team', attributes: ['id', 'name', 'status'] }],
    });

    res.json({
      member: {
        ...sanitizeUser(updated),
        team: updated.team ? updated.team.toJSON() : null,
      },
    });
  } catch (error) {
    throw error;
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const member = await User.findOne({
      where: {
        id: req.params.id,
        ownerUserId: req.authContext.ownerUserId,
        role: 'member',
      },
    });
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');

    const password = String(req.body.password || '');
    if (password.trim().length < 6) {
      throw new AppError(400, 'PASSWORD_TOO_SHORT', 'Password must be at least 6 characters');
    }

    await member.update({
      password,
      mustChangePassword: true,
    });

    res.json({ message: 'Password reset', member: sanitizeUser(member) });
  } catch (error) {
    throw error;
  }
};

exports.deleteMember = async (req, res) => {
  try {
    const member = await User.findOne({
      where: {
        id: req.params.id,
        ownerUserId: req.authContext.ownerUserId,
        role: 'member',
      },
    });
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');

    await User.sequelize.transaction(async (transaction) => {
      await Contact.update(
        { assignedUserId: null },
        { where: { assignedUserId: member.id }, transaction }
      );
      await Contact.update(
        { assignedByUserId: null },
        { where: { assignedByUserId: member.id }, transaction }
      );
      await ContactGroup.update(
        { assignedUserId: null },
        { where: { assignedUserId: member.id }, transaction }
      );
      await Team.update(
        { lastAutoAssignedMemberId: null },
        {
          where: {
            ownerUserId: req.authContext.ownerUserId,
            lastAutoAssignedMemberId: member.id,
          },
          transaction,
        }
      );
      await member.destroy({ transaction });
    });

    res.json({ message: 'Member deleted' });
  } catch (error) {
    throw error;
  }
};
