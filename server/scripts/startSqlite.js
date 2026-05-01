process.env.DB_DIALECT = process.env.DB_DIALECT || 'sqlite';
process.env.SQLITE_STORAGE = process.env.SQLITE_STORAGE || 'data/dev.sqlite';

require('./startWithAutoMigrate');
