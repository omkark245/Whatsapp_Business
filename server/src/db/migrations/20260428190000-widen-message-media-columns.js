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

module.exports = {
  async up({ context: queryInterface, Sequelize }) {
    const { DataTypes } = Sequelize;

    if (await tableExists(queryInterface, 'messages')) {
      await queryInterface.changeColumn('messages', 'media_url', {
        type: DataTypes.TEXT,
        allowNull: true,
      });
      console.log('Widened messages.media_url to TEXT');
    }

    if (await tableExists(queryInterface, 'campaign_messages')) {
      await queryInterface.changeColumn('campaign_messages', 'error_message', {
        type: DataTypes.TEXT,
        allowNull: true,
      });
      console.log('Widened campaign_messages.error_message to TEXT');
    }

    if (await tableExists(queryInterface, 'templates')) {
      await queryInterface.changeColumn('templates', 'header_content', {
        type: DataTypes.TEXT,
        allowNull: true,
      });
      console.log('Widened templates.header_content to TEXT');
    }
  },

  async down() {
    // Intentionally left as a no-op. Reverting these columns back to VARCHAR(255)
    // risks truncating already stored media URLs and template content.
  },
};
