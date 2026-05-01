const { Op } = require('sequelize');
const {
  sequelize,
  Contact,
  Team,
  User,
} = require('../models');

function getNextRoundRobinMember(members = [], lastAutoAssignedMemberId = null) {
  if (!Array.isArray(members) || members.length === 0) return null;

  const orderedMembers = [...members].sort((left, right) => Number(left.id) - Number(right.id));
  const lastIndex = orderedMembers.findIndex((member) => Number(member.id) === Number(lastAutoAssignedMemberId));

  if (lastIndex === -1 || lastIndex === orderedMembers.length - 1) {
    return orderedMembers[0];
  }

  return orderedMembers[lastIndex + 1];
}

async function loadRealtimeContact(contactId, options = {}) {
  if (!contactId) return null;

  return Contact.findByPk(contactId, {
    ...options,
    include: [
      { model: Team, as: 'team', attributes: ['id', 'name'] },
      { model: User, as: 'assignedUser', attributes: ['id', 'name'] },
    ],
  });
}

async function autoAssignInboundContact(contactId) {
  if (!contactId) return null;

  const transaction = await sequelize.transaction();

  try {
    const contact = await Contact.findByPk(contactId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!contact) {
      await transaction.commit();
      return null;
    }

    if (!contact.teamId || contact.assignedUserId) {
      await transaction.commit();
      return loadRealtimeContact(contact.id);
    }

    const team = await Team.findOne({
      where: {
        id: contact.teamId,
        status: { [Op.ne]: 'archived' },
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!team) {
      await transaction.commit();
      return loadRealtimeContact(contact.id);
    }

    const members = await User.findAll({
      where: {
        ownerUserId: team.ownerUserId,
        role: 'member',
        status: 'active',
        teamId: team.id,
      },
      attributes: ['id', 'name', 'teamId', 'status'],
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const nextMember = getNextRoundRobinMember(members, team.lastAutoAssignedMemberId);
    if (!nextMember) {
      await transaction.commit();
      return loadRealtimeContact(contact.id);
    }

    const [updatedContacts] = await Contact.update({
      assignedUserId: nextMember.id,
    }, {
      where: {
        id: contact.id,
        assignedUserId: { [Op.is]: null },
      },
      transaction,
    });

    if (!updatedContacts) {
      await transaction.commit();
      return loadRealtimeContact(contact.id);
    }

    await team.update({
      lastAutoAssignedMemberId: nextMember.id,
    }, {
      transaction,
    });

    await transaction.commit();
    return loadRealtimeContact(contact.id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  autoAssignInboundContact,
  getNextRoundRobinMember,
  loadRealtimeContact,
};
