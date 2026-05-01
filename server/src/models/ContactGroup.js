const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ContactGroup = sequelize.define('ContactGroup', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  waAccountId: { type: DataTypes.INTEGER, allowNull: false, field: 'wa_account_id' },
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.STRING, allowNull: true },
  teamId: { type: DataTypes.INTEGER, allowNull: true, field: 'team_id' },
  assignedUserId: { type: DataTypes.INTEGER, allowNull: true, field: 'assigned_user_id' },
}, { tableName: 'contact_groups', timestamps: true });

module.exports = ContactGroup;
