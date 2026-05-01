process.env.DB_DIALECT = process.env.DB_DIALECT || 'postgres';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'whatsapp_platform';
process.env.DB_USER = process.env.DB_USER || 'postgres';
process.env.DB_ADMIN_DB = process.env.DB_ADMIN_DB || 'postgres';

require('./startWithAutoMigrate');
