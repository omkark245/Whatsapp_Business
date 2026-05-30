# Hostinger Deployment

This project is a split app:

- `client`: React/Vite web app
- `server`: Express API with Sequelize migrations

Use two Hostinger websites or subdomains:

- Frontend: `https://whatsapp.finlectechnologies.com`
- Backend API: `https://api.whatsapp.finlectechnologies.com`

## Backend API

Create a Node.js app for the `server` directory.

Recommended settings:

- Framework: `Express.js` or `Other`
- App/root directory: `server`
- Install command: `npm ci --omit=dev`
- Build command: leave empty
- Start command: `npm start`
- Entry file, if Hostinger asks: `scripts/startWithAutoMigrate.js`

Environment variables:

```env
NODE_ENV=production
DB_DIALECT=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=u123456789_whatsapp
DB_USER=u123456789_whatsapp
DB_PASSWORD=replace_with_hostinger_mysql_password
DB_AUTO_MIGRATE=true

JWT_SECRET=replace_with_random_64_character_secret
JWT_EXPIRES_IN=7d
WEBHOOK_VERIFY_TOKEN=replace_with_random_verify_token
META_APP_ID=replace_with_meta_app_id
META_APP_SECRET=replace_with_meta_app_secret
META_API_VERSION=v21.0

CLIENT_ORIGIN=https://whatsapp.finlectechnologies.com
ALLOWED_ORIGINS=https://whatsapp.finlectechnologies.com
PUBLIC_API_BASE_URL=https://api.whatsapp.finlectechnologies.com
```

The backend accepts both `DB_PASS` and `DB_PASSWORD`. Use `DB_PASSWORD` in Hostinger because that is the name Hostinger documents for Node.js MySQL apps.

Do not commit the real `.env` file or real secrets.

## Frontend

Create a Vite/static frontend app for the `client` directory.

Recommended settings:

- App/root directory: `client`
- Install command: `npm ci --include=dev`
- Build command: `npm run build`
- Output directory: `dist`

Environment variables:

```env
VITE_API_URL=https://api.whatsapp.finlectechnologies.com/api
VITE_SOCKET_URL=https://api.whatsapp.finlectechnologies.com
```

If refresh on `/chat`, `/settings`, or another route returns 404, enable the SPA fallback / rewrite-to-`index.html` option in Hostinger.

## Login And Users

After the backend is live and connected to MySQL, create the first admin user through:

```http
POST https://api.whatsapp.finlectechnologies.com/api/auth/register
Content-Type: application/json

{
  "name": "Admin",
  "email": "admin@example.com",
  "password": "strong-password"
}
```

After that, login uses:

```http
POST https://api.whatsapp.finlectechnologies.com/api/auth/login
```

The app stores login in an `httpOnly` cookie, so the frontend must call the API with credentials enabled. This is already configured in `client/src/services/api.js`.

## Common Fixes

- `Access denied for user`: check `DB_USER`, `DB_PASSWORD`, and that the MySQL user is assigned to the database in hPanel.
- `Cannot connect to MySQL`: use `DB_HOST=localhost` and `DB_PORT=3306` for Hostinger MySQL.
- `UNSAFE_RUNTIME_CONFIG`: set a strong `JWT_SECRET`, `WEBHOOK_VERIFY_TOKEN`, and the real `META_APP_SECRET`.
- Browser CORS/login cookie issue: confirm `CLIENT_ORIGIN` and `ALLOWED_ORIGINS` exactly match the frontend URL.
- Uploaded media not visible publicly: confirm `PUBLIC_API_BASE_URL` points to the backend API domain using HTTPS.
