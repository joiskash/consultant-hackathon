import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-only: proxy backend calls to the engine so the browser stays same-origin
// (no CORS needed). ENGINE_URL sets the full target (e.g. http://backend:3000 in
// Docker); otherwise fall back to localhost with a configurable ENGINE_PORT (default 3100).
const engine = process.env.ENGINE_URL ?? `http://localhost:${process.env.ENGINE_PORT ?? '3100'}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: engine, changeOrigin: true },
      '/session': { target: engine, changeOrigin: true },
    },
  },
  preview: { host: '0.0.0.0', port: 5173 },
});
