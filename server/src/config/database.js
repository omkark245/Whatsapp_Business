const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { Sequelize } = require('sequelize');
require('dotenv').config();

const rawDatabaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRESQL_URL ||
  process.env.DB_URL ||
  '';
const databaseUrl = rawDatabaseUrl.trim();

function inferDialect() {
  if (process.env.DB_DIALECT) return process.env.DB_DIALECT;
  if (/^postgres(ql)?:\/\//i.test(databaseUrl)) return 'postgres';
  if (/^mysql:\/\//i.test(databaseUrl)) return 'mysql';
  return 'mysql';
}

const dialect = inferDialect();
const defaultPort = dialect === 'postgres' ? 5432 : 3306;

function parseDatabaseUrl(urlValue) {
  if (!urlValue) return {};
  const parsed = new URL(urlValue);
  return {
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    host: parsed.hostname,
    port: Number(parsed.port || defaultPort),
  };
}

const databaseUrlConfig = parseDatabaseUrl(databaseUrl);
const dbPort = Number(process.env.DB_PORT || databaseUrlConfig.port || defaultPort);
const dbPassword = process.env.DB_PASS ?? process.env.PGPASSWORD ?? databaseUrlConfig.password ?? '';
const dbName = process.env.DB_NAME || databaseUrlConfig.database;
const dbUser = process.env.DB_USER || databaseUrlConfig.username;
const dbHost = process.env.DB_HOST || databaseUrlConfig.host;
const pool = { max: 10, min: 0, acquire: 30000, idle: 10000 };

function getDialectOptions() {
  if (process.env.DB_SSL !== 'true') return {};
  return {
    ssl: {
      require: true,
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    },
  };
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

const sequelize = (() => {
  if (dialect === 'sqlite') {
    const storagePath = path.resolve(process.cwd(), process.env.SQLITE_STORAGE || 'data/dev.sqlite');
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });

    return new Sequelize({
      dialect: 'sqlite',
      storage: storagePath,
      logging: false,
    });
  }

  if (databaseUrl) {
    return new Sequelize(databaseUrl, {
      dialect,
      logging: false,
      pool,
      dialectOptions: getDialectOptions(),
    });
  }

  return new Sequelize(
    dbName,
    dbUser,
    dbPassword,
    {
      host: dbHost,
      port: dbPort,
      dialect,
      logging: false,
      pool,
      dialectOptions: getDialectOptions(),
    }
  );
})();

async function ensureDatabase() {
  if (dialect !== 'postgres') return;
  if (databaseUrl && process.env.DB_ENSURE_DATABASE !== 'true') return;

  const adminDatabase = process.env.DB_ADMIN_DB || 'postgres';
  const targetDatabase = dbName;

  if (!targetDatabase) {
    throw new Error('DB_NAME is required when using PostgreSQL');
  }

  const client = new Client({
    host: dbHost || 'localhost',
    port: dbPort,
    user: dbUser || 'postgres',
    password: dbPassword,
    database: adminDatabase,
    ssl: getDialectOptions().ssl,
  });

  try {
    await client.connect();

    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDatabase]
    );

    if (!rowCount) {
      await client.query(`CREATE DATABASE ${quoteIdentifier(targetDatabase)}`);
      console.log(`Created PostgreSQL database "${targetDatabase}"`);
    }
  } catch (error) {
    error.message =
      `Failed to prepare PostgreSQL database "${targetDatabase}". ` +
      'Check DB_HOST, DB_PORT, DB_USER, DB_PASS, and DB_ADMIN_DB. ' +
      error.message;
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

module.exports = sequelize;
module.exports.ensureDatabase = ensureDatabase;
