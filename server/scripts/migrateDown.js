require('dotenv').config();

const database = require('../src/config/database');
const { sequelize } = require('../src/models');
const { umzug } = require('../src/db/umzug');

(async () => {
  try {
    await database.ensureDatabase();
    await sequelize.authenticate();

    const target = process.argv[2];
    const options = target
      ? (/^\d+$/.test(target) ? { step: Number(target) } : { to: target })
      : {};

    const reverted = await umzug.down(options);
    if (!reverted.length) {
      console.log('No migrations reverted.');
    } else {
      console.log(`Reverted ${reverted.length} migration(s):`);
      reverted.forEach((migration) => console.log(`- ${migration.name}`));
    }
    process.exit(0);
  } catch (error) {
    console.error('Rollback failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close().catch(() => {});
  }
})();
