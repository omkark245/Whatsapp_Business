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

function timestamps(DataTypes) {
  return {
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  };
}

async function ensureTable(queryInterface, tableName, schema) {
  if (!(await tableExists(queryInterface, tableName))) {
    await queryInterface.createTable(tableName, schema);
    return;
  }

  const columns = await queryInterface.describeTable(tableName);
  const missingColumns = Object.entries(schema).filter(([columnName]) => !columns[columnName]);

  for (const [columnName, definition] of missingColumns) {
    await queryInterface.addColumn(tableName, columnName, definition);
    console.log(`Added ${tableName}.${columnName}`);
  }
}

async function dropTableIfExists(queryInterface, tableName) {
  if (await tableExists(queryInterface, tableName)) {
    await queryInterface.dropTable(tableName);
  }
}

module.exports = {
  async up({ context: queryInterface, Sequelize }) {
    const { DataTypes } = Sequelize;

    await ensureTable(queryInterface, 'users', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING, allowNull: false },
      email: { type: DataTypes.STRING, allowNull: false, unique: true },
      password: { type: DataTypes.STRING, allowNull: false },
      role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'admin' },
      owner_user_id: { type: DataTypes.INTEGER, allowNull: true },
      team_id: { type: DataTypes.INTEGER, allowNull: true },
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'active' },
      must_change_password: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'teams', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      owner_user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
      name: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'active' },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'wa_accounts', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
      waba_id: { type: DataTypes.STRING, allowNull: true },
      phone_number_id: { type: DataTypes.STRING, allowNull: true },
      phone_number: { type: DataTypes.STRING, allowNull: true },
      business_name: { type: DataTypes.STRING, allowNull: true },
      access_token: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.ENUM('active', 'inactive', 'pending'), allowNull: false, defaultValue: 'pending' },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'contacts', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wa_account_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'wa_accounts', key: 'id' } },
      wa_id: { type: DataTypes.STRING, allowNull: false },
      phone: { type: DataTypes.STRING, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: true },
      profile_pic: { type: DataTypes.STRING, allowNull: true },
      last_message_at: { type: DataTypes.DATE, allowNull: true },
      team_id: { type: DataTypes.INTEGER, allowNull: true },
      assigned_user_id: { type: DataTypes.INTEGER, allowNull: true },
      assigned_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'messages', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      contact_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'contacts', key: 'id' } },
      wa_account_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'wa_accounts', key: 'id' } },
      direction: { type: DataTypes.ENUM('inbound', 'outbound'), allowNull: false },
      type: {
        type: DataTypes.ENUM('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'template', 'interactive', 'reaction'),
        allowNull: false,
        defaultValue: 'text',
      },
      content: { type: DataTypes.TEXT, allowNull: true },
      media_url: { type: DataTypes.STRING, allowNull: true },
      media_id: { type: DataTypes.STRING, allowNull: true },
      wa_message_id: { type: DataTypes.STRING, allowNull: true },
      status: { type: DataTypes.ENUM('pending', 'sent', 'delivered', 'read', 'failed'), allowNull: false, defaultValue: 'pending' },
      metadata: { type: DataTypes.JSON, allowNull: true },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'templates', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wa_account_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'wa_accounts', key: 'id' } },
      meta_template_id: { type: DataTypes.STRING, allowNull: true },
      name: { type: DataTypes.STRING, allowNull: false },
      language: { type: DataTypes.STRING, allowNull: false, defaultValue: 'en_US' },
      category: { type: DataTypes.ENUM('MARKETING', 'UTILITY', 'AUTHENTICATION'), allowNull: false },
      header_type: { type: DataTypes.ENUM('none', 'text', 'image', 'video', 'document'), allowNull: false, defaultValue: 'none' },
      header_content: { type: DataTypes.TEXT, allowNull: true },
      body: { type: DataTypes.TEXT, allowNull: false },
      footer: { type: DataTypes.STRING, allowNull: true },
      buttons: { type: DataTypes.JSON, allowNull: true },
      status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'DELETED'), allowNull: false, defaultValue: 'PENDING' },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'flows', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wa_account_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'wa_accounts', key: 'id' } },
      name: { type: DataTypes.STRING, allowNull: false },
      trigger_type: { type: DataTypes.ENUM('keyword', 'all', 'none'), allowNull: false, defaultValue: 'keyword' },
      trigger_value: { type: DataTypes.STRING, allowNull: true },
      flow_data: { type: DataTypes.JSON, allowNull: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'flow_sessions', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      flow_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'flows', key: 'id' } },
      contact_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'contacts', key: 'id' } },
      current_node: { type: DataTypes.STRING, allowNull: true },
      data: { type: DataTypes.JSON, allowNull: true },
      status: { type: DataTypes.ENUM('active', 'completed', 'expired'), allowNull: false, defaultValue: 'active' },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'contact_groups', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wa_account_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'wa_accounts', key: 'id' } },
      name: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.STRING, allowNull: true },
      team_id: { type: DataTypes.INTEGER, allowNull: true },
      assigned_user_id: { type: DataTypes.INTEGER, allowNull: true },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'contact_group_members', {
      group_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, references: { model: 'contact_groups', key: 'id' } },
      contact_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, references: { model: 'contacts', key: 'id' } },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'campaigns', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wa_account_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'wa_accounts', key: 'id' } },
      name: { type: DataTypes.STRING, allowNull: false },
      template_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'templates', key: 'id' } },
      group_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'contact_groups', key: 'id' } },
      team_id: { type: DataTypes.INTEGER, allowNull: true },
      created_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
      variables_mapping: { type: DataTypes.JSON, allowNull: true },
      scheduled_at: { type: DataTypes.DATE, allowNull: true },
      status: { type: DataTypes.ENUM('draft', 'scheduled', 'running', 'completed', 'cancelled'), allowNull: false, defaultValue: 'draft' },
      total_messages: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      sent_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      delivered_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      read_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      failed_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'campaign_messages', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      campaign_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'campaigns', key: 'id' } },
      contact_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'contacts', key: 'id' } },
      message_id: { type: DataTypes.STRING, allowNull: true },
      status: { type: DataTypes.ENUM('pending', 'sent', 'delivered', 'read', 'failed'), allowNull: false, defaultValue: 'pending' },
      error_message: { type: DataTypes.TEXT, allowNull: true },
      error_code: { type: DataTypes.STRING, allowNull: true },
      failure_source: { type: DataTypes.STRING, allowNull: true },
      sent_at: { type: DataTypes.DATE, allowNull: true },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'quick_replies', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wa_account_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'wa_accounts', key: 'id' } },
      title: { type: DataTypes.STRING, allowNull: false },
      shortcut: { type: DataTypes.STRING, allowNull: true },
      content: { type: DataTypes.TEXT, allowNull: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'contact_labels', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wa_account_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'wa_accounts', key: 'id' } },
      name: { type: DataTypes.STRING, allowNull: false },
      color: { type: DataTypes.STRING, allowNull: false, defaultValue: '#25D366' },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'contact_label_assignments', {
      label_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, references: { model: 'contact_labels', key: 'id' } },
      contact_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true, references: { model: 'contacts', key: 'id' } },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'auto_replies', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wa_account_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'wa_accounts', key: 'id' } },
      type: { type: DataTypes.ENUM('keyword', 'greeting', 'away'), allowNull: false },
      keyword: { type: DataTypes.STRING, allowNull: true },
      match_type: { type: DataTypes.ENUM('exact', 'contains'), allowNull: false, defaultValue: 'contains' },
      reply_text: { type: DataTypes.TEXT, allowNull: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      schedule_start: { type: DataTypes.STRING, allowNull: true },
      schedule_end: { type: DataTypes.STRING, allowNull: true },
      schedule_days: { type: DataTypes.JSON, allowNull: true },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'drip_campaigns', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      wa_account_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'wa_accounts', key: 'id' } },
      name: { type: DataTypes.STRING, allowNull: false },
      group_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'contact_groups', key: 'id' } },
      steps: { type: DataTypes.JSON, allowNull: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: DataTypes.ENUM('draft', 'active', 'paused', 'completed'), allowNull: false, defaultValue: 'draft' },
      ...timestamps(DataTypes),
    });

    await ensureTable(queryInterface, 'drip_campaign_enrollments', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      drip_campaign_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'drip_campaigns', key: 'id' } },
      contact_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'contacts', key: 'id' } },
      current_step: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      next_send_at: { type: DataTypes.DATE, allowNull: true },
      status: { type: DataTypes.ENUM('active', 'completed', 'cancelled'), allowNull: false, defaultValue: 'active' },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      ...timestamps(DataTypes),
    });
  },

  async down({ context: queryInterface }) {
    await dropTableIfExists(queryInterface, 'drip_campaign_enrollments');
    await dropTableIfExists(queryInterface, 'drip_campaigns');
    await dropTableIfExists(queryInterface, 'auto_replies');
    await dropTableIfExists(queryInterface, 'contact_label_assignments');
    await dropTableIfExists(queryInterface, 'contact_labels');
    await dropTableIfExists(queryInterface, 'quick_replies');
    await dropTableIfExists(queryInterface, 'campaign_messages');
    await dropTableIfExists(queryInterface, 'campaigns');
    await dropTableIfExists(queryInterface, 'contact_group_members');
    await dropTableIfExists(queryInterface, 'contact_groups');
    await dropTableIfExists(queryInterface, 'flow_sessions');
    await dropTableIfExists(queryInterface, 'flows');
    await dropTableIfExists(queryInterface, 'templates');
    await dropTableIfExists(queryInterface, 'messages');
    await dropTableIfExists(queryInterface, 'contacts');
    await dropTableIfExists(queryInterface, 'wa_accounts');
    await dropTableIfExists(queryInterface, 'teams');
    await dropTableIfExists(queryInterface, 'users');

    if (queryInterface.sequelize.getDialect() === 'postgres') {
      const enumTypes = [
        'enum_wa_accounts_status',
        'enum_messages_direction',
        'enum_messages_type',
        'enum_messages_status',
        'enum_templates_category',
        'enum_templates_header_type',
        'enum_templates_status',
        'enum_flows_trigger_type',
        'enum_flow_sessions_status',
        'enum_campaigns_status',
        'enum_campaign_messages_status',
        'enum_auto_replies_type',
        'enum_auto_replies_match_type',
        'enum_drip_campaigns_status',
        'enum_drip_campaign_enrollments_status',
      ];

      for (const enumType of enumTypes) {
        await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${enumType}";`);
      }
    }
  },
};
