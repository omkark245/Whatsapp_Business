const { Contact, ContactGroup, Team, User } = require('../models');
const { AppError } = require('../utils/errors');

exports.getTeams = async (req, res) => {
  try {
    const teams = await Team.findAll({
      where: { ownerUserId: req.authContext.ownerUserId },
      order: [['createdAt', 'DESC']],
    });
    res.json({ teams });
  } catch (error) {
    throw error;
  }
};

exports.createTeam = async (req, res) => {
  try {
    const team = await Team.create({
      ownerUserId: req.authContext.ownerUserId,
      name: String(req.body.name || '').trim(),
      description: String(req.body.description || '').trim() || null,
      status: 'active',
    });
    res.status(201).json({ team });
  } catch (error) {
    throw error;
  }
};

exports.updateTeam = async (req, res) => {
  try {
    const team = await Team.findOne({
      where: { id: req.params.id, ownerUserId: req.authContext.ownerUserId },
    });
    if (!team) throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');

    await team.update({
      name: typeof req.body.name === 'string' ? req.body.name.trim() || team.name : team.name,
      description: typeof req.body.description === 'string' ? req.body.description.trim() || null : team.description,
      status: typeof req.body.status === 'string' ? req.body.status : team.status,
    });

    res.json({ team });
  } catch (error) {
    throw error;
  }
};

exports.deleteTeam = async (req, res) => {
  try {
    const team = await Team.findOne({
      where: { id: req.params.id, ownerUserId: req.authContext.ownerUserId },
    });
    if (!team) throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');

    await Team.sequelize.transaction(async (transaction) => {
      const teamMembers = await User.findAll({
        where: {
          ownerUserId: req.authContext.ownerUserId,
          teamId: team.id,
          role: 'member',
        },
        attributes: ['id'],
        transaction,
      });
      const memberIds = teamMembers.map((member) => member.id);

      if (memberIds.length > 0) {
        await Contact.update(
          { assignedUserId: null },
          { where: { assignedUserId: memberIds }, transaction }
        );
        await ContactGroup.update(
          { assignedUserId: null },
          { where: { assignedUserId: memberIds }, transaction }
        );
      }

      await User.update(
        { teamId: null },
        {
          where: {
            ownerUserId: req.authContext.ownerUserId,
            teamId: team.id,
            role: 'member',
          },
          transaction,
        }
      );
      await Contact.update(
        { teamId: null, assignedUserId: null },
        { where: { teamId: team.id }, transaction }
      );
      await ContactGroup.update(
        { teamId: null, assignedUserId: null },
        { where: { teamId: team.id }, transaction }
      );
      await team.update({ status: 'archived', lastAutoAssignedMemberId: null }, { transaction });
    });

    res.json({ message: 'Team archived', team });
  } catch (error) {
    throw error;
  }
};
