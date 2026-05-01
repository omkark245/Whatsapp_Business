require('dotenv').config();

const database = require('../src/config/database');
const { sequelize } = require('../src/models');
const { migrateToLatest } = require('../src/db/umzug');

(async () => {
  try {
    await database.ensureDatabase();
    await sequelize.authenticate();
    const executed = await migrateToLatest();
    if (!executed.length) {
      console.log('No pending migrations.');
    } else {
      console.log(`Applied ${executed.length} migration(s):`);
      executed.forEach((migration) => console.log(`- ${migration.name}`));
    }
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close().catch(() => {});
  }
})();
