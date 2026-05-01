const { Op } = require('sequelize');
const { Team, User } = require('../models');
const { AppError } = require('./errors');

function hasTeamAccess(authContext, teamId) {
  if (!authContext?.isMember) return true;
  return Boolean(teamId) && Number(teamId) === Number(authContext.teamId);
}

function ensureTeamAccess(authContext, teamId, label = 'resource') {
  if (hasTeamAccess(authContext, teamId)) return;

  throw new AppError(403, 'TEAM_ACCESS_DENIED', `You do not have access to this ${label}`);
}

async function normalizeAssignmentInput(ownerUserId, teamId, assignedUserId) {
  let resolvedTeam = null;
  let resolvedAssignedUser = null;

  if (teamId) {
    resolvedTeam = await Team.findOne({
      where: {
        id: Number(teamId),
        ownerUserId,
        status: { [Op.ne]: 'archived' },
      },
    });
    if (!resolvedTeam) {
      throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
    }
  }

  if (assignedUserId) {
    resolvedAssignedUser = await User.findOne({
      where: {
        id: Number(assignedUserId),
        ownerUserId,
        role: 'member',
      },
    });
    if (!resolvedAssignedUser) {
      throw new AppError(404, 'ASSIGNED_MEMBER_NOT_FOUND', 'Assigned member not found');
    }

    if (resolvedTeam && Number(resolvedAssignedUser.teamId) !== Number(resolvedTeam.id)) {
      throw new AppError(400, 'ASSIGNED_MEMBER_TEAM_MISMATCH', 'Assigned member does not belong to this team');
    }

    if (!resolvedTeam && resolvedAssignedUser.teamId) {
      resolvedTeam = await Team.findOne({
        where: {
          id: resolvedAssignedUser.teamId,
          ownerUserId,
        },
      });
    }
  }

  return {
    teamId: resolvedTeam?.id || null,
    assignedUserId: resolvedAssignedUser?.id || null,
    team: resolvedTeam,
    assignedUser: resolvedAssignedUser,
  };
}

async function applyGroupDefaultAssignment(group, contacts = [], assignedByUserId = null) {
  if (!group?.teamId || !Array.isArray(contacts) || contacts.length === 0) return;

  for (const contact of contacts) {
    if (!contact || contact.teamId || contact.assignedUserId) continue;

    await contact.update({
      teamId: group.teamId,
      assignedUserId: group.assignedUserId || null,
      assignedByUserId: assignedByUserId || contact.assignedByUserId || null,
    });
  }
}

module.exports = {
  applyGroupDefaultAssignment,
  ensureTeamAccess,
  hasTeamAccess,
  normalizeAssignmentInput,
};
