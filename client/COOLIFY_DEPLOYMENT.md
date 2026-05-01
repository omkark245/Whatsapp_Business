# Coolify Frontend Deployment

Use this setup for the React/Vite frontend.

## Coolify App Settings

- Base Directory: `client`
- Build Pack: `Nixpacks`
- Static Site: enabled
- Publish Directory: `dist`
- Install Command: `npm ci --include=dev`
- Build Command: `npm run build`
- Domain: `https://whatsapp.finlectechnologies.com`

## Environment Variables

The app has a safe production fallback for `whatsapp.finlectechnologies.com`, but set these in Coolify for clarity:

```env
VITE_API_URL=https://api.whatsapp.finlectechnologies.com/api
VITE_SOCKET_URL=https://api.whatsapp.finlectechnologies.com
```

## SPA Fallback

If direct browser refresh on `/chat`, `/settings`, or `/templates` returns 404, enable the SPA option in Coolify.

If Coolify asks for custom Nginx config, use:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

Coolify/Caddy startup lines such as `admin endpoint disabled` and `automatic HTTPS is completely disabled` are normal because Coolify handles HTTPS at the proxy layer.
