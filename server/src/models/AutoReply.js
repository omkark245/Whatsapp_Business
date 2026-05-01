const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AutoReply = sequelize.define('AutoReply', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  waAccountId: { type: DataTypes.INTEGER, allowNull: false, field: 'wa_account_id' },
  type: { type: DataTypes.ENUM('keyword', 'greeting', 'away'), allowNull: false },
  keyword: { type: DataTypes.STRING, allowNull: true },
  matchType: { type: DataTypes.ENUM('exact', 'contains'), defaultValue: 'contains', field: 'match_type' },
  replyText: { type: DataTypes.TEXT, allowNull: false, field: 'reply_text' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
  // For greeting/away schedule
  scheduleStart: { type: DataTypes.STRING, allowNull: true, field: 'schedule_start' }, // HH:mm
  scheduleEnd: { type: DataTypes.STRING, allowNull: true, field: 'schedule_end' },     // HH:mm
  scheduleDays: { type: DataTypes.JSON, allowNull: true, field: 'schedule_days' },     // [0,1,2,3,4,5,6]
}, { tableName: 'auto_replies', timestamps: true });

module.exports = AutoReply;
