const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Team = sequelize.define('Team', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  ownerUserId: { type: DataTypes.INTEGER, allowNull: false, field: 'owner_user_id' },
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'active' },
  lastAutoAssignedMemberId: { type: DataTypes.INTEGER, allowNull: true, field: 'last_auto_assigned_member_id' },
}, { tableName: 'teams', timestamps: true });

module.exports = Team;
