const test = require('node:test');
const assert = require('node:assert/strict');

const migration = require('../src/db/migrations/20260428190000-widen-message-media-columns');

test('widen-message-media-columns migration widens long-text campaign media fields', async () => {
  const describeCalls = [];
  const changeCalls = [];
  const queryInterface = {
    async describeTable(tableName) {
      describeCalls.push(tableName);
      return { id: { type: 'INTEGER' } };
    },
    async changeColumn(tableName, columnName, definition) {
      changeCalls.push({ tableName, columnName, definition });
    },
  };

  await migration.up({
    context: queryInterface,
    Sequelize: {
      DataTypes: {
        TEXT: 'TEXT',
      },
    },
  });

  assert.deepEqual(describeCalls, ['messages', 'campaign_messages', 'templates']);
  assert.deepEqual(
    changeCalls.map(({ tableName, columnName, definition }) => ({
      tableName,
      columnName,
      type: definition.type,
      allowNull: definition.allowNull,
    })),
    [
      { tableName: 'messages', columnName: 'media_url', type: 'TEXT', allowNull: true },
      { tableName: 'campaign_messages', columnName: 'error_message', type: 'TEXT', allowNull: true },
      { tableName: 'templates', columnName: 'header_content', type: 'TEXT', allowNull: true },
    ]
  );
});
