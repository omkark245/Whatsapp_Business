const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DripCampaign = sequelize.define('DripCampaign', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  waAccountId: { type: DataTypes.INTEGER, allowNull: false, field: 'wa_account_id' },
  name: { type: DataTypes.STRING, allowNull: false },
  groupId: { type: DataTypes.INTEGER, allowNull: false, field: 'group_id' },
  steps: { type: DataTypes.JSON, allowNull: false }, // [{ delayMinutes, templateId, variablesMapping }]
  isActive: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_active' },
  status: { type: DataTypes.ENUM('draft', 'active', 'paused', 'completed'), defaultValue: 'draft' },
}, { tableName: 'drip_campaigns', timestamps: true });

module.exports = DripCampaign;
