const fs = require('fs');
const path = require('path');

const migrationName = process.argv.slice(2).join('-').trim().replace(/\s+/g, '-');

if (!migrationName) {
  console.error('Usage: npm run migrate:create -- your-migration-name');
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const fileName = `${timestamp}-${migrationName}.js`;
const migrationsDir = path.resolve(__dirname, '../src/db/migrations');
const targetPath = path.join(migrationsDir, fileName);

if (!fs.existsSync(migrationsDir)) {
  fs.mkdirSync(migrationsDir, { recursive: true });
}

if (fs.existsSync(targetPath)) {
  console.error(`Migration already exists: ${targetPath}`);
  process.exit(1);
}

const template = `'use strict';

module.exports = {
  async up({ context: queryInterface, Sequelize }) {
    const { DataTypes } = Sequelize;

    // TODO: add schema changes here
  },

  async down({ context: queryInterface, Sequelize }) {
    const { DataTypes } = Sequelize;

    // TODO: revert schema changes here
  },
};
`;

fs.writeFileSync(targetPath, template, 'utf8');
console.log(`Created migration: ${targetPath}`);
