function getOwnerUserId(user) {
  const ownerCandidate = user?.ownerUserId ?? user?.owner_user_id ?? user?.id ?? null;
  return ownerCandidate ? Number(ownerCandidate) : null;
}

function buildAuthContext(user) {
  const role = String(user?.role || 'admin').toLowerCase();
  const ownerUserId = getOwnerUserId(user);
  const teamId = user?.teamId ?? user?.team_id ?? null;

  return {
    userId: user?.id ? Number(user.id) : null,
    role,
    ownerUserId,
    teamId: teamId ? Number(teamId) : null,
    isAdmin: role === 'admin',
    isMember: role === 'member',
  };
}

function sanitizeUser(user) {
  const context = buildAuthContext(user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: context.role,
    ownerUserId: context.ownerUserId,
    teamId: context.teamId,
    status: user.status || 'active',
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

module.exports = {
  buildAuthContext,
  getOwnerUserId,
  sanitizeUser,
};
