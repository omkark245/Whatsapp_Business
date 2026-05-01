const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');
const { after, beforeEach, test } = require('node:test');

const storagePath = path.join(os.tmpdir(), `whats2-auto-assignment-${process.pid}.sqlite`);

process.env.DB_DIALECT = 'sqlite';
process.env.SQLITE_STORAGE = storagePath;

const { sequelize, AutoReply, Contact, Flow, Team, User, WaAccount } = require('../src/models');
const {
  autoAssignInboundContact,
  getNextRoundRobinMember,
} = require('../src/services/autoAssignmentService');
const setupWebhook = require('../src/webhooks/whatsappWebhook');
const { buildContactPayload } = require('../src/utils/socketEvents');

async function seedBase() {
  const admin = await User.create({
    name: 'Owner Admin',
    email: `owner-${Date.now()}-${Math.random()}@example.com`,
    password: 'password123',
    role: 'admin',
    status: 'active',
  });

  const team = await Team.create({
    ownerUserId: admin.id,
    name: 'Support',
    status: 'active',
  });

  const waAccount = await WaAccount.create({
    userId: admin.id,
    phoneNumberId: `pn-${Date.now()}-${Math.random()}`,
    status: 'active',
  });

  return { admin, team, waAccount };
}

async function createMember(team, suffix, status = 'active') {
  return User.create({
    name: `Member ${suffix}`,
    email: `member-${suffix}-${Date.now()}-${Math.random()}@example.com`,
    password: 'password123',
    role: 'member',
    ownerUserId: team.ownerUserId,
    teamId: team.id,
    status,
  });
}

async function createContact(waAccount, teamId = null, assignedUserId = null) {
  return Contact.create({
    waAccountId: waAccount.id,
    waId: `91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
    phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    name: 'Inbound Contact',
    teamId,
    assignedUserId,
  });
}

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

after(async () => {
  await sequelize.close().catch(() => {});
  fs.rmSync(storagePath, { force: true });
});

test('getNextRoundRobinMember returns the first member when cursor is missing or stale', () => {
  const members = [{ id: 3 }, { id: 7 }];

  assert.equal(getNextRoundRobinMember(members, null).id, 3);
  assert.equal(getNextRoundRobinMember(members, 99).id, 3);
});

test('autoAssignInboundContact assigns the first active member and enriches payload data', async () => {
  const { team, waAccount } = await seedBase();
  const firstMember = await createMember(team, 'a');
  await createMember(team, 'b');
  const contact = await createContact(waAccount, team.id);

  const updatedContact = await autoAssignInboundContact(contact.id);
  const refreshedTeam = await Team.findByPk(team.id);
  const payload = buildContactPayload(updatedContact);

  assert.equal(updatedContact.assignedUserId, firstMember.id);
  assert.equal(refreshedTeam.lastAutoAssignedMemberId, firstMember.id);
  assert.equal(updatedContact.team?.name, team.name);
  assert.equal(updatedContact.assignedUser?.name, firstMember.name);
  assert.deepEqual(payload.team, { id: team.id, name: team.name });
  assert.deepEqual(payload.assignedUser, { id: firstMember.id, name: firstMember.name });
});

test('autoAssignInboundContact rotates members and wraps when it reaches the end', async () => {
  const { team, waAccount } = await seedBase();
  const firstMember = await createMember(team, 'a');
  const secondMember = await createMember(team, 'b');
  const firstContact = await createContact(waAccount, team.id);
  const secondContact = await createContact(waAccount, team.id);
  const thirdContact = await createContact(waAccount, team.id);

  const firstAssignment = await autoAssignInboundContact(firstContact.id);
  const secondAssignment = await autoAssignInboundContact(secondContact.id);
  const thirdAssignment = await autoAssignInboundContact(thirdContact.id);
  const refreshedTeam = await Team.findByPk(team.id);

  assert.equal(firstAssignment.assignedUserId, firstMember.id);
  assert.equal(secondAssignment.assignedUserId, secondMember.id);
  assert.equal(thirdAssignment.assignedUserId, firstMember.id);
  assert.equal(refreshedTeam.lastAutoAssignedMemberId, firstMember.id);
});

test('autoAssignInboundContact leaves no-team contacts unassigned', async () => {
  const { waAccount } = await seedBase();
  const contact = await createContact(waAccount, null);

  const updatedContact = await autoAssignInboundContact(contact.id);

  assert.equal(updatedContact.assignedUserId, null);
  assert.equal(updatedContact.teamId, null);
});

test('autoAssignInboundContact does not override an existing assignee', async () => {
  const { team, waAccount } = await seedBase();
  await createMember(team, 'a');
  const existingAssignee = await createMember(team, 'b');
  const contact = await createContact(waAccount, team.id, existingAssignee.id);

  const updatedContact = await autoAssignInboundContact(contact.id);
  const refreshedTeam = await Team.findByPk(team.id);

  assert.equal(updatedContact.assignedUserId, existingAssignee.id);
  assert.equal(refreshedTeam.lastAutoAssignedMemberId, null);
});

test('autoAssignInboundContact leaves contacts unassigned when a team has no active members', async () => {
  const { team, waAccount } = await seedBase();
  await createMember(team, 'inactive', 'inactive');
  const contact = await createContact(waAccount, team.id);

  const updatedContact = await autoAssignInboundContact(contact.id);
  const refreshedTeam = await Team.findByPk(team.id);

  assert.equal(updatedContact.assignedUserId, null);
  assert.equal(refreshedTeam.lastAutoAssignedMemberId, null);
});

test('resolveWebhookWaAccount prefers the duplicate account with active auto replies when no active flow exists', async () => {
  const admin = await User.create({
    name: 'Duplicate Owner',
    email: `duplicate-owner-${Date.now()}-${Math.random()}@example.com`,
    password: 'password123',
    role: 'admin',
    status: 'active',
  });
  const phoneNumberId = `duplicate-phone-${Date.now()}-${Math.random()}`;

  await WaAccount.create({
    userId: admin.id,
    phoneNumberId,
    phoneNumber: '+91 97632 50689',
    status: 'active',
  });
  const replyAccount = await WaAccount.create({
    userId: admin.id,
    phoneNumberId,
    phoneNumber: '+91 97632 50689',
    status: 'active',
  });

  await AutoReply.create({
    waAccountId: replyAccount.id,
    type: 'keyword',
    keyword: 'hello',
    matchType: 'contains',
    replyText: 'Hello from the active auto reply account',
    isActive: true,
  });

  const resolved = await setupWebhook.resolveWebhookWaAccount(phoneNumberId);

  assert.equal(resolved.id, replyAccount.id);
});

test('resolveWebhookWaAccount prefers the duplicate account with an active flow over auto replies', async () => {
  const admin = await User.create({
    name: 'Flow Owner',
    email: `flow-owner-${Date.now()}-${Math.random()}@example.com`,
    password: 'password123',
    role: 'admin',
    status: 'active',
  });
  const phoneNumberId = `flow-duplicate-phone-${Date.now()}-${Math.random()}`;

  const flowAccount = await WaAccount.create({
    userId: admin.id,
    phoneNumberId,
    phoneNumber: '+91 97632 50689',
    status: 'active',
  });
  const replyAccount = await WaAccount.create({
    userId: admin.id,
    phoneNumberId,
    phoneNumber: '+91 97632 50689',
    status: 'active',
  });

  await Flow.create({
    waAccountId: flowAccount.id,
    name: 'Inbound Welcome',
    triggerType: 'keyword',
    triggerValue: 'hello',
    flowData: {
      nodes: [
        { id: 'start', type: 'startNode', data: { triggerType: 'keyword', triggerValue: 'hello' } },
        { id: 'message', type: 'messageNode', data: { text: 'Welcome' } },
      ],
      edges: [
        { id: 'edge-1', source: 'start', target: 'message' },
      ],
    },
    isActive: true,
  });

  await AutoReply.create({
    waAccountId: replyAccount.id,
    type: 'keyword',
    keyword: 'hello',
    matchType: 'contains',
    replyText: 'Hello from the active auto reply account',
    isActive: true,
  });

  const resolved = await setupWebhook.resolveWebhookWaAccount(phoneNumberId);

  assert.equal(resolved.id, flowAccount.id);
});
