const {
  sequelize,
  ContactGroup,
  Contact,
  Team,
  User,
  Message,
  FlowSession,
  CampaignMessage,
  DripCampaignEnrollment,
} = require('../models');
const {
  findOwnedWaAccount,
  findOwnedGroup,
  findOwnedContacts,
  findOwnedContact,
} = require('../utils/ownership');
const { applyGroupDefaultAssignment, normalizeAssignmentInput } = require('../utils/teamAccess');
const { AppError } = require('../utils/errors');

const uniqueContactIds = (contactIds = []) =>
  [...new Set(contactIds.map((id) => Number(id)).filter(Boolean))];

exports.getGroups = async (req, res) => {
  try {
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const groups = await ContactGroup.findAll({
      where: {
        waAccountId: account.id,
        ...(req.authContext.isMember ? { teamId: req.authContext.teamId } : {}),
      },
      include: [
        { model: Contact, as: 'contacts', attributes: ['id'] },
        { model: Team, as: 'team', attributes: ['id', 'name'] },
        { model: User, as: 'assignedUser', attributes: ['id', 'name', 'email'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    const result = groups.map((group) => ({
      ...group.toJSON(),
      contactCount: group.contacts.length,
      contacts: undefined,
    }));
    res.json({ groups: result });
  } catch (error) {
    throw error;
  }
};

exports.createGroup = async (req, res) => {
  try {
    const { name, description, contactIds = [] } = req.body;
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const group = await ContactGroup.create({ waAccountId: account.id, name, description });

    if (contactIds.length > 0) {
      const ids = uniqueContactIds(contactIds);
      const contacts = await findOwnedContacts(req.authContext, ids, account.id);
      if (contacts.length !== ids.length) {
        throw new AppError(400, 'CONTACT_OWNERSHIP_MISMATCH', 'One or more contacts do not belong to this account');
      }
      await group.addContacts(contacts);
      await applyGroupDefaultAssignment(group, contacts, req.authContext.userId);
    }

    res.status(201).json({ group });
  } catch (error) {
    throw error;
  }
};

exports.addContacts = async (req, res) => {
  try {
    const group = await findOwnedGroup(req.authContext, req.params.id);
    if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');

    const ids = uniqueContactIds(req.body.contactIds || []);
    const contacts = await findOwnedContacts(req.authContext, ids, group.waAccountId);
    if (contacts.length !== ids.length) {
      throw new AppError(400, 'CONTACT_OWNERSHIP_MISMATCH', 'One or more contacts do not belong to this account');
    }

    await group.addContacts(contacts);
    await applyGroupDefaultAssignment(group, contacts, req.authContext.userId);
    res.json({ message: 'Contacts added' });
  } catch (error) {
    throw error;
  }
};

exports.removeContact = async (req, res) => {
  try {
    const group = await findOwnedGroup(req.authContext, req.params.id);
    if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');

    const contact = await findOwnedContact(req.authContext, req.params.contactId, {
      where: { waAccountId: group.waAccountId },
    });

    if (contact) await group.removeContact(contact);
    res.json({ message: 'Contact removed' });
  } catch (error) {
    throw error;
  }
};

exports.deleteGroup = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const deleteContacts = req.query.deleteContacts === 'true' || req.body?.deleteContacts === true || req.body?.deleteContacts === 'true';
    const group = await findOwnedGroup(req.authContext, req.params.id, {
      include: [{ model: Contact, as: 'contacts', attributes: ['id'] }],
      transaction,
    });

    if (!group) {
      await transaction.rollback();
      throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
    }

    const contactIds = (group.contacts || []).map((contact) => contact.id);
    let deletedContacts = 0;

    if (deleteContacts && contactIds.length > 0) {
      await FlowSession.destroy({ where: { contactId: contactIds }, transaction });
      await CampaignMessage.destroy({ where: { contactId: contactIds }, transaction });
      await DripCampaignEnrollment.destroy({ where: { contactId: contactIds }, transaction });
      await Message.destroy({ where: { contactId: contactIds }, transaction });

      await sequelize.query(
        'DELETE FROM contact_label_assignments WHERE contact_id IN (:contactIds)',
        { replacements: { contactIds }, transaction }
      );
      await sequelize.query(
        'DELETE FROM contact_group_members WHERE contact_id IN (:contactIds)',
        { replacements: { contactIds }, transaction }
      );

      deletedContacts = await Contact.destroy({
        where: { id: contactIds, waAccountId: group.waAccountId },
        transaction,
      });
    } else {
      await sequelize.query(
        'DELETE FROM contact_group_members WHERE group_id = :groupId',
        { replacements: { groupId: group.id }, transaction }
      );
    }

    await group.destroy({ transaction });
    await transaction.commit();

    res.json({
      message: deleteContacts ? 'Group and contacts deleted' : 'Group deleted',
      deletedContacts,
      movedContacts: deleteContacts ? 0 : contactIds.length,
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

exports.updateAssignment = async (req, res) => {
  try {
    const group = await findOwnedGroup(req.authContext, req.params.id, {
      include: [{ model: Contact, as: 'contacts' }],
    });
    if (!group) throw new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');

    const assignment = await normalizeAssignmentInput(
      req.authContext.ownerUserId,
      req.body.teamId,
      req.body.assignedUserId
    );

    await group.update({
      teamId: assignment.teamId,
      assignedUserId: assignment.assignedUserId,
    });

    await applyGroupDefaultAssignment(group, group.contacts || [], req.authContext.userId);

    const refreshed = await ContactGroup.findByPk(group.id, {
      include: [
        { model: Team, as: 'team', attributes: ['id', 'name'] },
        { model: User, as: 'assignedUser', attributes: ['id', 'name', 'email'] },
      ],
    });

    res.json({ group: refreshed });
  } catch (error) {
    throw error;
  }
};
