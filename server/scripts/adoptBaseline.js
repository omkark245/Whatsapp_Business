require('dotenv').config();

const database = require('../src/config/database');
const { sequelize } = require('../src/models');
const { BASELINE_MIGRATION_NAME, REQUIRED_SCHEMA } = require('../src/db/baselineManifest');
const { umzug } = require('../src/db/umzug');

async function verifySchema(queryInterface) {
  const issues = [];

  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_SCHEMA)) {
    let columns;
    try {
      columns = await queryInterface.describeTable(tableName);
    } catch (error) {
      issues.push(`Missing table: ${tableName}`);
      continue;
    }

    for (const column of requiredColumns) {
      if (!columns[column]) {
        issues.push(`Missing column: ${tableName}.${column}`);
      }
    }
  }

  return issues;
}

(async () => {
  try {
    await database.ensureDatabase();
    await sequelize.authenticate();

    const executed = await umzug.executed();
    if (executed.some((migration) => migration.name === BASELINE_MIGRATION_NAME)) {
      console.log(`Baseline migration already adopted: ${BASELINE_MIGRATION_NAME}`);
      process.exit(0);
    }

    const issues = await verifySchema(sequelize.getQueryInterface());
    if (issues.length) {
      console.error('Baseline adoption aborted. Database does not match the expected live schema:');
      issues.forEach((issue) => console.error(`- ${issue}`));
      process.exit(1);
    }

    await umzug.storage.logMigration({ name: BASELINE_MIGRATION_NAME });
    console.log(`Marked baseline migration as applied: ${BASELINE_MIGRATION_NAME}`);
    process.exit(0);
  } catch (error) {
    console.error('Failed to adopt baseline migration:', error);
    process.exit(1);
  } finally {
    await sequelize.close().catch(() => {});
  }
})();
