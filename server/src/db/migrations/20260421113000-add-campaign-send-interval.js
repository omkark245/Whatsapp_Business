async function tableExists(queryInterface, tableName) {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch (error) {
    if (/no description found|does not exist|unknown table/i.test(String(error.message || ''))) {
      return false;
    }
    throw error;
  }
}

async function ensureColumn(queryInterface, tableName, columnName, definition) {
  if (!(await tableExists(queryInterface, tableName))) return;

  const columns = await queryInterface.describeTable(tableName);
  if (!columns[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition);
    console.log(`Added ${tableName}.${columnName}`);
  }
}

module.exports = {
  async up({ context: queryInterface, Sequelize }) {
    const { DataTypes } = Sequelize;

    await ensureColumn(queryInterface, 'campaigns', 'send_interval_seconds', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
    });

    await queryInterface.bulkUpdate(
      'campaigns',
      { send_interval_seconds: 3 },
      { send_interval_seconds: null }
    ).catch(() => {});
  },

  async down({ context: queryInterface }) {
    await queryInterface.removeColumn('campaigns', 'send_interval_seconds').catch(() => {});
  },
};
