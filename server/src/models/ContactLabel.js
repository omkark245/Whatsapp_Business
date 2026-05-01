const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ContactLabel = sequelize.define('ContactLabel', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  waAccountId: { type: DataTypes.INTEGER, allowNull: false, field: 'wa_account_id' },
  name: { type: DataTypes.STRING, allowNull: false },
  color: { type: DataTypes.STRING, defaultValue: '#25D366' },
}, { tableName: 'contact_labels', timestamps: true });

module.exports = ContactLabel;
