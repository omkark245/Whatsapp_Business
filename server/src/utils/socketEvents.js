const { digitsOnly, normalizeIndianDisplayPhone } = require('./phoneUtils');

const USER_ROOM_PREFIX = 'user:';
const TEAM_ROOM_PREFIX = 'team:';
const OWNER_ROOM_PREFIX = 'owner:';

function toPlain(value) {
  if (!value) return null;
  return typeof value.toJSON === 'function' ? value.toJSON() : value;
}

function getUserRoom(userId) {
  return `${USER_ROOM_PREFIX}${userId}`;
}

function getTeamRoom(teamId) {
  return `${TEAM_ROOM_PREFIX}${teamId}`;
}

function getOwnerRoom(ownerUserId) {
  return `${OWNER_ROOM_PREFIX}${ownerUserId}`;
}

function buildMessagePreview(message) {
  const raw = toPlain(message);
  if (!raw) return null;

  return {
    id: raw.id,
    type: raw.type,
    content: raw.content,
    direction: raw.direction,
    status: raw.status,
    metadata: raw.metadata ?? null,
    createdAt: raw.createdAt,
  };
}

function buildContactPayload(contact, lastMessage = null) {
  const raw = toPlain(contact);
  if (!raw) return null;

  const teamId = raw.teamId ?? raw.team_id ?? null;
  const assignedUserId = raw.assignedUserId ?? raw.assigned_user_id ?? null;
  const teamName = raw.team?.name ?? raw.team_name ?? raw.teamName ?? null;
  const assignedUserName =
    raw.assignedUser?.name ??
    raw.assigned_user?.name ??
    raw.assignedUserName ??
    null;

  const payload = {
    id: raw.id,
    waAccountId: raw.waAccountId ?? raw.wa_account_id ?? null,
    waId: raw.waId ?? raw.wa_id ?? null,
    phone: normalizeIndianDisplayPhone(digitsOnly(raw.phone ?? raw.waId ?? raw.wa_id ?? '')) || null,
    name: raw.name ?? null,
    profilePic: raw.profilePic ?? raw.profile_pic ?? null,
    lastMessageAt: raw.lastMessageAt ?? raw.last_message_at ?? null,
    teamId,
    teamName,
    assignedUserId,
    assignedUserName,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };

  if (teamId || teamName) {
    payload.team = {
      id: teamId,
      name: teamName,
    };
  }

  if (assignedUserId || assignedUserName) {
    payload.assignedUser = {
      id: assignedUserId,
      name: assignedUserName,
    };
  }

  if (Array.isArray(raw.messages) && raw.messages.length > 0) {
    payload.messages = raw.messages.map((message) => buildMessagePreview(message)).filter(Boolean);
  } else if (lastMessage) {
    const preview = buildMessagePreview(lastMessage);
    if (preview) payload.messages = [preview];
  }

  return payload;
}

function emitUserEvent(io, userId, event, payload) {
  if (!io || !userId) return;
  io.to(getUserRoom(userId)).emit(event, payload);
}

function emitAuthScopedEvent(io, event, payload, { ownerUserId, teamId, assignedUserId } = {}) {
  if (!io) return;
  if (ownerUserId) io.to(getOwnerRoom(ownerUserId)).emit(event, payload);
  if (teamId) io.to(getTeamRoom(teamId)).emit(event, payload);
  if (assignedUserId) io.to(getUserRoom(assignedUserId)).emit(event, payload);
}

function emitNewMessage(io, userIdOrScope, { message, contact }) {
  const payload = {
    message: toPlain(message),
    contact: buildContactPayload(contact, message),
  };

  if (typeof userIdOrScope === 'object' && userIdOrScope !== null) {
    emitAuthScopedEvent(io, 'new_message', payload, userIdOrScope);
    return;
  }

  emitUserEvent(io, userIdOrScope, 'new_message', payload);
}

function emitMessageStatus(io, userIdOrScope, { waMessageId, status, failure = null }) {
  const payload = { waMessageId, status };
  if (failure) payload.failure = failure;

  if (typeof userIdOrScope === 'object' && userIdOrScope !== null) {
    emitAuthScopedEvent(io, 'message_status', payload, userIdOrScope);
    return;
  }

  emitUserEvent(io, userIdOrScope, 'message_status', payload);
}

module.exports = {
  buildContactPayload,
  emitMessageStatus,
  emitNewMessage,
  emitUserEvent,
  getOwnerRoom,
  getTeamRoom,
  getUserRoom,
};
