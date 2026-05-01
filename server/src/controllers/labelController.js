const { ContactLabel, Contact } = require('../models');
const {
  findOwnedWaAccount,
  findOwnedLabel,
  findOwnedContacts,
  findOwnedContact,
} = require('../utils/ownership');
const { AppError } = require('../utils/errors');

const uniqueContactIds = (contactIds = []) =>
  [...new Set(contactIds.map((id) => Number(id)).filter(Boolean))];

exports.getLabels = async (req, res) => {
  try {
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const labels = await ContactLabel.findAll({
      where: { waAccountId: account.id },
      include: [{ model: Contact, as: 'contacts', attributes: ['id'] }],
      order: [['name', 'ASC']],
    });

    const result = labels.map((label) => ({
      ...label.toJSON(),
      contactCount: label.contacts.length,
      contacts: undefined,
    }));
    res.json({ labels: result });
  } catch (error) {
    throw error;
  }
};

exports.createLabel = async (req, res) => {
  try {
    const { name, color } = req.body;
    const account = await findOwnedWaAccount(req.authContext, req.params.waAccountId);
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const label = await ContactLabel.create({
      waAccountId: account.id,
      name,
      color,
    });
    res.status(201).json({ label });
  } catch (error) {
    throw error;
  }
};

exports.updateLabel = async (req, res) => {
  try {
    const label = await findOwnedLabel(req.authContext, req.params.id);
    if (!label) throw new AppError(404, 'LABEL_NOT_FOUND', 'Label not found');
    await label.update(req.body);
    res.json({ label });
  } catch (error) {
    throw error;
  }
};

exports.deleteLabel = async (req, res) => {
  try {
    const label = await findOwnedLabel(req.authContext, req.params.id);
    if (!label) throw new AppError(404, 'LABEL_NOT_FOUND', 'Label not found');
    await label.destroy();
    res.json({ message: 'Deleted' });
  } catch (error) {
    throw error;
  }
};

exports.assignLabel = async (req, res) => {
  try {
    const label = await findOwnedLabel(req.authContext, req.params.labelId);
    if (!label) throw new AppError(404, 'LABEL_NOT_FOUND', 'Label not found');

    const ids = uniqueContactIds(req.body.contactIds || []);
    const contacts = await findOwnedContacts(req.authContext, ids, label.waAccountId);
    if (contacts.length !== ids.length) {
      throw new AppError(400, 'CONTACT_OWNERSHIP_MISMATCH', 'One or more contacts do not belong to this account');
    }

    await label.addContacts(contacts);
    res.json({ message: 'Labels assigned' });
  } catch (error) {
    throw error;
  }
};

exports.removeLabel = async (req, res) => {
  try {
    const label = await findOwnedLabel(req.authContext, req.params.labelId);
    if (!label) throw new AppError(404, 'LABEL_NOT_FOUND', 'Label not found');

    const contact = await findOwnedContact(req.authContext, req.params.contactId, {
      where: { waAccountId: label.waAccountId },
    });

    if (contact) await label.removeContact(contact);
    res.json({ message: 'Label removed' });
  } catch (error) {
    throw error;
  }
};
