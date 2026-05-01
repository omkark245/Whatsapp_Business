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
  if (columns[columnName]) return;

  await queryInterface.addColumn(tableName, columnName, definition);
  console.log(`Added ${tableName}.${columnName}`);
}

module.exports = {
  async up({ context: queryInterface, Sequelize }) {
    const { DataTypes } = Sequelize;

    await ensureColumn(queryInterface, 'quick_replies', 'is_active', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down({ context: queryInterface }) {
    await queryInterface.removeColumn('quick_replies', 'is_active').catch(() => {});
  },
};
