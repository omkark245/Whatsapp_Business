const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuickReply = sequelize.define('QuickReply', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  waAccountId: { type: DataTypes.INTEGER, allowNull: false, field: 'wa_account_id' },
  title: { type: DataTypes.STRING, allowNull: false },
  shortcut: { type: DataTypes.STRING, allowNull: true },
  content: { type: DataTypes.TEXT, allowNull: false },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
}, { tableName: 'quick_replies', timestamps: true });

module.exports = QuickReply;
