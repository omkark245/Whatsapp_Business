const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CampaignMessage = sequelize.define('CampaignMessage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  campaignId: { type: DataTypes.INTEGER, allowNull: false, field: 'campaign_id' },
  contactId: { type: DataTypes.INTEGER, allowNull: false, field: 'contact_id' },
  messageId: { type: DataTypes.STRING, allowNull: true, field: 'message_id' },
  status: { type: DataTypes.ENUM('pending', 'sent', 'delivered', 'read', 'failed'), defaultValue: 'pending' },
  errorMessage: { type: DataTypes.TEXT, allowNull: true, field: 'error_message' },
  errorCode: { type: DataTypes.STRING, allowNull: true, field: 'error_code' },
  failureSource: { type: DataTypes.STRING, allowNull: true, field: 'failure_source' },
  sentAt: { type: DataTypes.DATE, allowNull: true, field: 'sent_at' },
}, { tableName: 'campaign_messages', timestamps: true });

module.exports = CampaignMessage;
