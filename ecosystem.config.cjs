module.exports = {
  apps: [
    {
      name: 'whatsapp-api',
      cwd: './server',
      script: 'scripts/startWithAutoMigrate.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: '5001',
        DB_AUTO_MIGRATE: 'true',
        CLIENT_ORIGIN: 'https://whatsapp.finlectechnologies.com',
        ALLOWED_ORIGINS: 'https://whatsapp.finlectechnologies.com',
        PUBLIC_API_BASE_URL: 'https://api.whatsapp.finlectechnologies.com',
      },
      max_memory_restart: '500M',
      watch: false,
      autorestart: true,
    },
    {
      name: 'whatsapp-web',
      cwd: './client',
      script: 'npm',
      args: 'run preview -- --host 0.0.0.0 --port 5173',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '300M',
      watch: false,
      autorestart: true,
    },
  ],
};
