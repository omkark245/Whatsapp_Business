const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const WaAccount = sequelize.define('WaAccount', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
  wabaId: { type: DataTypes.STRING, allowNull: true, field: 'waba_id' },
  phoneNumberId: { type: DataTypes.STRING, allowNull: true, field: 'phone_number_id' },
  phoneNumber: { type: DataTypes.STRING, allowNull: true, field: 'phone_number' },
  businessName: { type: DataTypes.STRING, allowNull: true, field: 'business_name' },
  accessToken: { type: DataTypes.TEXT, allowNull: true, field: 'access_token' },
  status: { type: DataTypes.ENUM('active', 'inactive', 'pending'), defaultValue: 'pending' },
}, { tableName: 'wa_accounts', timestamps: true });

module.exports = WaAccount;
