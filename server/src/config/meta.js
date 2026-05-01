require('dotenv').config();

module.exports = {
  appId: process.env.META_APP_ID,
  appSecret: process.env.META_APP_SECRET,
  apiVersion: process.env.META_API_VERSION || 'v21.0',
  graphUrl: 'https://graph.facebook.com',
  webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN,
};
