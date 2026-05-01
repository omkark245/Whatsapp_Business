const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FlowSession = sequelize.define('FlowSession', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  flowId: { type: DataTypes.INTEGER, allowNull: false, field: 'flow_id' },
  contactId: { type: DataTypes.INTEGER, allowNull: false, field: 'contact_id' },
  currentNode: { type: DataTypes.STRING, allowNull: true, field: 'current_node' },
  data: { type: DataTypes.JSON, allowNull: true },
  status: { type: DataTypes.ENUM('active', 'completed', 'expired'), defaultValue: 'active' },
  completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
}, { tableName: 'flow_sessions', timestamps: true });

module.exports = FlowSession;
