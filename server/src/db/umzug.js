const path = require('path');
const { Umzug, SequelizeStorage } = require('umzug');
const Sequelize = require('sequelize');
const sequelize = require('../config/database');

const migrationsGlob = path.join(__dirname, 'migrations', '*.js').replace(/\\/g, '/');

const umzug = new Umzug({
  migrations: {
    glob: migrationsGlob,
    resolve: ({ name, path: migrationPath, context }) => {
      const migration = require(migrationPath);
      return {
        name,
        up: async () => migration.up({ context, Sequelize }),
        down: async () => migration.down({ context, Sequelize }),
      };
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

async function migrateToLatest() {
  return umzug.up();
}

module.exports = {
  umzug,
  migrateToLatest,
};
