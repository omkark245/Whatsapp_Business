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

async function ensureColumns(queryInterface, tableName, columns) {
  for (const [columnName, definition] of Object.entries(columns)) {
    await ensureColumn(queryInterface, tableName, columnName, definition);
  }
}

async function ensureTeamsTable(queryInterface, DataTypes) {
  if (await tableExists(queryInterface, 'teams')) return;

  await queryInterface.createTable('teams', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    owner_user_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'active' },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  console.log('Created teams table');
}

module.exports = {
  async up({ context: queryInterface, Sequelize }) {
    const { DataTypes } = Sequelize;

    await ensureTeamsTable(queryInterface, DataTypes);

    await ensureColumns(queryInterface, 'users', {
      role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'admin' },
      owner_user_id: { type: DataTypes.INTEGER, allowNull: true },
      team_id: { type: DataTypes.INTEGER, allowNull: true },
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'active' },
      must_change_password: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    });

    await queryInterface.sequelize.query(
      "UPDATE users SET role = 'admin' WHERE role IS NULL;"
    ).catch(() => {});
    await queryInterface.sequelize.query(
      "UPDATE users SET status = 'active' WHERE status IS NULL;"
    ).catch(() => {});
    await queryInterface.sequelize.query(
      'UPDATE users SET owner_user_id = id WHERE owner_user_id IS NULL;'
    ).catch(() => {});
    await queryInterface.sequelize.query(
      'UPDATE users SET must_change_password = false WHERE must_change_password IS NULL;'
    ).catch(() => {});

    await ensureColumns(queryInterface, 'contacts', {
      team_id: { type: DataTypes.INTEGER, allowNull: true },
      assigned_user_id: { type: DataTypes.INTEGER, allowNull: true },
      assigned_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
    });

    await ensureColumns(queryInterface, 'contact_groups', {
      team_id: { type: DataTypes.INTEGER, allowNull: true },
      assigned_user_id: { type: DataTypes.INTEGER, allowNull: true },
    });

    await ensureColumns(queryInterface, 'campaigns', {
      team_id: { type: DataTypes.INTEGER, allowNull: true },
      created_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
      variables_mapping: { type: DataTypes.JSON, allowNull: true },
    });

    await ensureColumns(queryInterface, 'campaign_messages', {
      error_message: { type: DataTypes.TEXT, allowNull: true },
      error_code: { type: DataTypes.STRING, allowNull: true },
      failure_source: { type: DataTypes.STRING, allowNull: true },
    });
  },

  async down({ context: queryInterface }) {
    await Promise.all([
      queryInterface.removeColumn('campaign_messages', 'failure_source').catch(() => {}),
      queryInterface.removeColumn('campaign_messages', 'error_code').catch(() => {}),
      queryInterface.removeColumn('campaign_messages', 'error_message').catch(() => {}),
      queryInterface.removeColumn('campaigns', 'variables_mapping').catch(() => {}),
      queryInterface.removeColumn('campaigns', 'created_by_user_id').catch(() => {}),
      queryInterface.removeColumn('campaigns', 'team_id').catch(() => {}),
      queryInterface.removeColumn('contact_groups', 'assigned_user_id').catch(() => {}),
      queryInterface.removeColumn('contact_groups', 'team_id').catch(() => {}),
      queryInterface.removeColumn('contacts', 'assigned_by_user_id').catch(() => {}),
      queryInterface.removeColumn('contacts', 'assigned_user_id').catch(() => {}),
      queryInterface.removeColumn('contacts', 'team_id').catch(() => {}),
      queryInterface.removeColumn('users', 'must_change_password').catch(() => {}),
      queryInterface.removeColumn('users', 'status').catch(() => {}),
      queryInterface.removeColumn('users', 'team_id').catch(() => {}),
      queryInterface.removeColumn('users', 'owner_user_id').catch(() => {}),
      queryInterface.removeColumn('users', 'role').catch(() => {}),
    ]);
  },
};
