const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Template = sequelize.define('Template', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  waAccountId: { type: DataTypes.INTEGER, allowNull: false, field: 'wa_account_id' },
  metaTemplateId: { type: DataTypes.STRING, allowNull: true, field: 'meta_template_id' },
  name: { type: DataTypes.STRING, allowNull: false },
  language: { type: DataTypes.STRING, defaultValue: 'en_US' },
  category: { type: DataTypes.ENUM('MARKETING', 'UTILITY', 'AUTHENTICATION'), allowNull: false },
  headerType: { type: DataTypes.ENUM('none', 'text', 'image', 'video', 'document'), defaultValue: 'none', field: 'header_type' },
  headerContent: { type: DataTypes.TEXT, allowNull: true, field: 'header_content' },
  body: { type: DataTypes.TEXT, allowNull: false },
  footer: { type: DataTypes.STRING, allowNull: true },
  buttons: { type: DataTypes.JSON, allowNull: true },
  status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'DELETED'), defaultValue: 'PENDING' },
}, { tableName: 'templates', timestamps: true });

module.exports = Template;
