const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Contact = sequelize.define('Contact', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  waAccountId: { type: DataTypes.INTEGER, allowNull: false, field: 'wa_account_id' },
  waId: { type: DataTypes.STRING, allowNull: false, field: 'wa_id' },
  phone: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: true },
  profilePic: { type: DataTypes.STRING, allowNull: true, field: 'profile_pic' },
  lastMessageAt: { type: DataTypes.DATE, allowNull: true, field: 'last_message_at' },
  teamId: { type: DataTypes.INTEGER, allowNull: true, field: 'team_id' },
  assignedUserId: { type: DataTypes.INTEGER, allowNull: true, field: 'assigned_user_id' },
  assignedByUserId: { type: DataTypes.INTEGER, allowNull: true, field: 'assigned_by_user_id' },
}, { tableName: 'contacts', timestamps: true });

module.exports = Contact;
