function firstNonBlank(env, names) {
  for (const name of names) {
    const value = env[name];
    if (value !== undefined && String(value).trim() !== '') {
      return value;
    }
  }
  return undefined;
}

function resolveDatabaseEnv(env = process.env, databaseUrlConfig = {}, defaultPort = 3306) {
  return {
    port: Number(firstNonBlank(env, ['DB_PORT', 'MYSQL_PORT']) || databaseUrlConfig.port || defaultPort),
    password:
      firstNonBlank(env, ['DB_PASS', 'DB_PASSWORD', 'MYSQL_PASSWORD', 'MYSQL_PASS', 'PGPASSWORD']) ??
      databaseUrlConfig.password ??
      '',
    name:
      firstNonBlank(env, ['DB_NAME', 'MYSQL_DATABASE', 'MYSQL_DB', 'MYSQL_NAME']) ||
      databaseUrlConfig.database,
    user:
      firstNonBlank(env, ['DB_USER', 'MYSQL_USER', 'MYSQL_USERNAME']) ||
      databaseUrlConfig.username,
    host:
      firstNonBlank(env, ['DB_HOST', 'MYSQL_HOST']) ||
      databaseUrlConfig.host,
  };
}

module.exports = {
  firstNonBlank,
  resolveDatabaseEnv,
};
