const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');
const { after, beforeEach, test } = require('node:test');

const storagePath = path.join(os.tmpdir(), `whats2-team-management-${process.pid}.sqlite`);

process.env.DB_DIALECT = 'sqlite';
process.env.SQLITE_STORAGE = storagePath;

const { sequelize, Contact, ContactGroup, Team, User, WaAccount } = require('../src/models');
const teamController = require('../src/controllers/teamController');
const teamMemberController = require('../src/controllers/teamMemberController');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function seedOwner() {
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

async function createMember(ownerUserId, teamId, suffix) {
  return User.create({
    name: `Member ${suffix}`,
    email: `member-${suffix}-${Date.now()}-${Math.random()}@example.com`,
    password: 'password123',
    role: 'member',
    ownerUserId,
    teamId,
    status: 'active',
  });
}

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

after(async () => {
  await sequelize.close().catch(() => {});
  fs.rmSync(storagePath, { force: true });
});

test('deleteTeam archives the team and clears member, contact, and group assignments', async () => {
  const { admin, team, waAccount } = await seedOwner();
  const member = await createMember(admin.id, team.id, 'team-delete');

  const contact = await Contact.create({
    waAccountId: waAccount.id,
    waId: '919876543210',
    phone: '9876543210',
    name: 'Assigned Contact',
    teamId: team.id,
    assignedUserId: member.id,
  });

  const group = await ContactGroup.create({
    waAccountId: waAccount.id,
    name: 'Assigned Group',
    teamId: team.id,
    assignedUserId: member.id,
  });

  const res = createResponse();
  await teamController.deleteTeam({
    params: { id: team.id },
    authContext: { ownerUserId: admin.id },
  }, res);

  const updatedTeam = await Team.findByPk(team.id);
  const updatedMember = await User.findByPk(member.id);
  const updatedContact = await Contact.findByPk(contact.id);
  const updatedGroup = await ContactGroup.findByPk(group.id);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'Team archived');
  assert.equal(updatedTeam.status, 'archived');
  assert.equal(updatedTeam.lastAutoAssignedMemberId, null);
  assert.equal(updatedMember.teamId, null);
  assert.equal(updatedContact.teamId, null);
  assert.equal(updatedContact.assignedUserId, null);
  assert.equal(updatedGroup.teamId, null);
  assert.equal(updatedGroup.assignedUserId, null);
});

test('deleteMember removes the member and clears assigned ownership links', async () => {
  const { admin, team, waAccount } = await seedOwner();
  const member = await createMember(admin.id, team.id, 'member-delete');
  await team.update({ lastAutoAssignedMemberId: member.id });

  const contact = await Contact.create({
    waAccountId: waAccount.id,
    waId: '919999999999',
    phone: '9999999999',
    name: 'Member Contact',
    teamId: team.id,
    assignedUserId: member.id,
    assignedByUserId: member.id,
  });

  const group = await ContactGroup.create({
    waAccountId: waAccount.id,
    name: 'Member Group',
    teamId: team.id,
    assignedUserId: member.id,
  });

  const res = createResponse();
  await teamMemberController.deleteMember({
    params: { id: member.id },
    authContext: { ownerUserId: admin.id },
  }, res);

  const deletedMember = await User.findByPk(member.id);
  const updatedTeam = await Team.findByPk(team.id);
  const updatedContact = await Contact.findByPk(contact.id);
  const updatedGroup = await ContactGroup.findByPk(group.id);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'Member deleted');
  assert.equal(deletedMember, null);
  assert.equal(updatedTeam.lastAutoAssignedMemberId, null);
  assert.equal(updatedContact.assignedUserId, null);
  assert.equal(updatedContact.assignedByUserId, null);
  assert.equal(updatedGroup.assignedUserId, null);
});
