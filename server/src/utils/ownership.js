const {
  WaAccount,
  Contact,
  Template,
  Flow,
  ContactGroup,
  ContactLabel,
  QuickReply,
  AutoReply,
  Campaign,
  DripCampaign,
} = require('../models');

function resolveOwnership(userOrContext) {
  if (typeof userOrContext === 'number' || typeof userOrContext === 'string') {
    const userId = Number(userOrContext);
    return {
      userId,
      ownerUserId: userId,
      teamId: null,
      role: 'admin',
      isAdmin: true,
      isMember: false,
    };
  }

  const userId = Number(userOrContext?.userId ?? userOrContext?.id ?? 0);
  const ownerUserId = Number(userOrContext?.ownerUserId ?? userOrContext?.owner_user_id ?? userId ?? 0);
  const teamId = userOrContext?.teamId ?? userOrContext?.team_id ?? null;
  const role = String(userOrContext?.role || 'admin').toLowerCase();

  return {
    userId,
    ownerUserId,
    teamId: teamId ? Number(teamId) : null,
    role,
    isAdmin: role === 'admin',
    isMember: role === 'member',
  };
}

const ownedWaAccountInclude = (userOrContext, extra = {}) => ({
  model: WaAccount,
  as: 'waAccount',
  attributes: ['id', 'userId', 'phoneNumberId', 'accessToken'],
  where: { userId: resolveOwnership(userOrContext).ownerUserId },
  required: true,
  ...extra,
});

async function findOwnedWaAccount(userOrContext, waAccountId, options = {}) {
  if (!waAccountId) return null;
  const { ownerUserId } = resolveOwnership(userOrContext);

  return WaAccount.findOne({
    where: { id: waAccountId, userId: ownerUserId },
    ...options,
  });
}

async function findOwnedResource(Model, userOrContext, id, options = {}) {
  const {
    include = [],
    where = {},
    waAccountAttributes = ['id', 'userId'],
    waAccountExtra = {},
    ...rest
  } = options;

  return Model.findOne({
    where: { ...where, id },
    include: [
      ownedWaAccountInclude(userOrContext, { attributes: waAccountAttributes, ...waAccountExtra }),
      ...include,
    ],
    ...rest,
  });
}

async function findOwnedContacts(userOrContext, contactIds, waAccountId = null) {
  const ids = [...new Set((contactIds || []).map((id) => Number(id)).filter(Boolean))];
  if (ids.length === 0) return [];

  return Contact.findAll({
    where: {
      id: ids,
      ...(waAccountId ? { waAccountId } : {}),
    },
    include: [ownedWaAccountInclude(userOrContext, { attributes: ['id', 'userId'] })],
  });
}

const findOwnedContact = (userOrContext, id, options = {}) =>
  findOwnedResource(Contact, userOrContext, id, options);

const findOwnedTemplate = (userOrContext, id, options = {}) =>
  findOwnedResource(Template, userOrContext, id, options);

const findOwnedFlow = (userOrContext, id, options = {}) =>
  findOwnedResource(Flow, userOrContext, id, options);

const findOwnedGroup = (userOrContext, id, options = {}) =>
  findOwnedResource(ContactGroup, userOrContext, id, options);

const findOwnedLabel = (userOrContext, id, options = {}) =>
  findOwnedResource(ContactLabel, userOrContext, id, options);

const findOwnedQuickReply = (userOrContext, id, options = {}) =>
  findOwnedResource(QuickReply, userOrContext, id, options);

const findOwnedAutoReply = (userOrContext, id, options = {}) =>
  findOwnedResource(AutoReply, userOrContext, id, options);

const findOwnedCampaign = (userOrContext, id, options = {}) =>
  findOwnedResource(Campaign, userOrContext, id, options);

const findOwnedDripCampaign = (userOrContext, id, options = {}) =>
  findOwnedResource(DripCampaign, userOrContext, id, options);

module.exports = {
  ownedWaAccountInclude,
  resolveOwnership,
  findOwnedWaAccount,
  findOwnedContacts,
  findOwnedContact,
  findOwnedTemplate,
  findOwnedFlow,
  findOwnedGroup,
  findOwnedLabel,
  findOwnedQuickReply,
  findOwnedAutoReply,
  findOwnedCampaign,
  findOwnedDripCampaign,
};
