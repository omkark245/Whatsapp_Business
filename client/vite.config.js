import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:5001'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': apiProxyTarget,
      '/uploads': apiProxyTarget,
      '/socket.io': {
        target: apiProxyTarget,
        ws: true,
      },
      '/webhook': apiProxyTarget,
      '/api/webhook': apiProxyTarget,
      '/api/whatsapp/webhook': apiProxyTarget,
    },
  },
})
