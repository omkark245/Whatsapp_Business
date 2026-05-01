process.env.DB_AUTO_MIGRATE = process.env.DB_AUTO_MIGRATE || 'true';

const { startApplication } = require('../src/app');

startApplication({ autoMigrate: true });
