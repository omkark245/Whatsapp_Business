const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Message = sequelize.define('Message', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  contactId: { type: DataTypes.INTEGER, allowNull: false, field: 'contact_id' },
  waAccountId: { type: DataTypes.INTEGER, allowNull: false, field: 'wa_account_id' },
  direction: { type: DataTypes.ENUM('inbound', 'outbound'), allowNull: false },
  type: {
    type: DataTypes.ENUM('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'template', 'interactive', 'reaction'),
    defaultValue: 'text',
  },
  content: { type: DataTypes.TEXT, allowNull: true },
  mediaUrl: { type: DataTypes.TEXT, allowNull: true, field: 'media_url' },
  mediaId: { type: DataTypes.STRING, allowNull: true, field: 'media_id' },
  waMessageId: { type: DataTypes.STRING, allowNull: true, field: 'wa_message_id' },
  status: { type: DataTypes.ENUM('pending', 'sent', 'delivered', 'read', 'failed'), defaultValue: 'pending' },
  metadata: { type: DataTypes.JSON, allowNull: true },
}, { tableName: 'messages', timestamps: true });

module.exports = Message;
