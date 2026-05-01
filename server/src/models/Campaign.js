const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Campaign = sequelize.define('Campaign', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  waAccountId: { type: DataTypes.INTEGER, allowNull: false, field: 'wa_account_id' },
  name: { type: DataTypes.STRING, allowNull: false },
  templateId: { type: DataTypes.INTEGER, allowNull: false, field: 'template_id' },
  groupId: { type: DataTypes.INTEGER, allowNull: true, field: 'group_id' },
  teamId: { type: DataTypes.INTEGER, allowNull: true, field: 'team_id' },
  createdByUserId: { type: DataTypes.INTEGER, allowNull: true, field: 'created_by_user_id' },
  variablesMapping: { type: DataTypes.JSON, allowNull: true, field: 'variables_mapping' },
  scheduledAt: { type: DataTypes.DATE, allowNull: true, field: 'scheduled_at' },
  sendIntervalSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'send_interval_seconds' },
  status: { type: DataTypes.ENUM('draft', 'scheduled', 'running', 'completed', 'cancelled'), defaultValue: 'draft' },
  totalMessages: { type: DataTypes.INTEGER, defaultValue: 0, field: 'total_messages' },
  sentCount: { type: DataTypes.INTEGER, defaultValue: 0, field: 'sent_count' },
  deliveredCount: { type: DataTypes.INTEGER, defaultValue: 0, field: 'delivered_count' },
  readCount: { type: DataTypes.INTEGER, defaultValue: 0, field: 'read_count' },
  failedCount: { type: DataTypes.INTEGER, defaultValue: 0, field: 'failed_count' },
}, { tableName: 'campaigns', timestamps: true });

module.exports = Campaign;
