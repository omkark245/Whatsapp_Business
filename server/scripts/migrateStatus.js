require('dotenv').config();

const database = require('../src/config/database');
const { sequelize } = require('../src/models');
const { umzug } = require('../src/db/umzug');

(async () => {
  try {
    await database.ensureDatabase();
    await sequelize.authenticate();

    const [executed, pending] = await Promise.all([
      umzug.executed(),
      umzug.pending(),
    ]);

    console.log(`Executed migrations: ${executed.length}`);
    executed.forEach((migration) => console.log(`- ${migration.name}`));

    console.log(`Pending migrations: ${pending.length}`);
    pending.forEach((migration) => console.log(`- ${migration.name}`));
    process.exit(0);
  } catch (error) {
    console.error('Migration status failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close().catch(() => {});
  }
})();
