const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DripCampaignEnrollment = sequelize.define('DripCampaignEnrollment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  dripCampaignId: { type: DataTypes.INTEGER, allowNull: false, field: 'drip_campaign_id' },
  contactId: { type: DataTypes.INTEGER, allowNull: false, field: 'contact_id' },
  currentStep: { type: DataTypes.INTEGER, defaultValue: 0, field: 'current_step' },
  nextSendAt: { type: DataTypes.DATE, allowNull: true, field: 'next_send_at' },
  status: { type: DataTypes.ENUM('active', 'completed', 'cancelled'), defaultValue: 'active' },
  completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
}, { tableName: 'drip_campaign_enrollments', timestamps: true });

module.exports = DripCampaignEnrollment;
