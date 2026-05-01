const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Flow = sequelize.define('Flow', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  waAccountId: { type: DataTypes.INTEGER, allowNull: false, field: 'wa_account_id' },
  name: { type: DataTypes.STRING, allowNull: false },
  triggerType: { type: DataTypes.ENUM('keyword', 'all', 'none'), defaultValue: 'keyword', field: 'trigger_type' },
  triggerValue: { type: DataTypes.STRING, allowNull: true, field: 'trigger_value' },
  flowData: { type: DataTypes.JSON, allowNull: false, field: 'flow_data' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_active' },
}, { tableName: 'flows', timestamps: true });

module.exports = Flow;
