const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Op } = require('sequelize');

const { __test__ } = require('../src/controllers/chatController');
const { WaAccount } = require('../src/models');

test('buildContactListWhere includes contacts with any persisted message direction', () => {
  const where = __test__.buildContactListWhere(
    { id: 42 },
    { isMember: false },
    ''
  );

  assert.equal(where.waAccountId, 42);
  assert.match(String(where.id[Op.in].val), /SELECT DISTINCT contact_id FROM messages WHERE wa_account_id IN \(42\)\)/);
  assert.doesNotMatch(String(where.id[Op.in].val), /direction\s*=\s*'inbound'/i);
});

test('buildContactListWhere preserves member team scoping and search filters', () => {
  const where = __test__.buildContactListWhere(
    { id: 7 },
    { isMember: true, teamId: 11 },
    'Asha'
  );

  assert.equal(where.teamId, 11);
  assert.ok(Array.isArray(where[Op.or]));
  assert.equal(where[Op.or].length, 3);
});

test('getRelatedWaAccountIds includes sibling accounts with the same phone number id', async (t) => {
  const originalFindAll = WaAccount.findAll;
  t.after(() => {
    WaAccount.findAll = originalFindAll;
  });

  WaAccount.findAll = async () => [{ id: 9 }, { id: 12 }];

  const ids = await __test__.getRelatedWaAccountIds({
    id: 9,
    userId: 6,
    phoneNumberId: '549928194876974',
    wabaId: '525230427348381',
  });

  assert.deepEqual(ids, [9, 12]);
});
