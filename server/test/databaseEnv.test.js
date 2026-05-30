const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveDatabaseEnv } = require('../src/config/databaseEnv');

test('resolveDatabaseEnv accepts Hostinger MySQL variable names', () => {
  const resolved = resolveDatabaseEnv({
    DB_HOST: 'localhost',
    DB_PORT: '3306',
    DB_USER: 'u123456789_user',
    DB_PASSWORD: 'StrongPass123',
    DB_NAME: 'u123456789_whatsapp',
  });

  assert.deepEqual(resolved, {
    host: 'localhost',
    port: 3306,
    user: 'u123456789_user',
    password: 'StrongPass123',
    name: 'u123456789_whatsapp',
  });
});

test('resolveDatabaseEnv keeps existing DB_PASS precedence over aliases', () => {
  const resolved = resolveDatabaseEnv({
    DB_PASS: 'existing-pass',
    DB_PASSWORD: 'hostinger-pass',
    MYSQL_PASSWORD: 'mysql-pass',
  });

  assert.equal(resolved.password, 'existing-pass');
});

test('resolveDatabaseEnv can read MySQL-prefixed variables', () => {
  const resolved = resolveDatabaseEnv({
    MYSQL_HOST: 'mysql.example.com',
    MYSQL_PORT: '3307',
    MYSQL_USER: 'mysql_user',
    MYSQL_PASSWORD: 'mysql_pass',
    MYSQL_DATABASE: 'mysql_db',
  });

  assert.deepEqual(resolved, {
    host: 'mysql.example.com',
    port: 3307,
    user: 'mysql_user',
    password: 'mysql_pass',
    name: 'mysql_db',
  });
});
