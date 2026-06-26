import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const { version: pkgVersion } = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')) as {
  version: string;
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  appType: 'mpa', // Multi-page: admin dashboard (index.html) + client portal (portal.html)
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || pkgVersion),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    rollupOptions: {
      input: {
        main:   resolve(process.cwd(), 'index.html'),
        portal: resolve(process.cwd(), 'portal.html'),
      },
    },
  },
  server: {
    port: 2886,
    proxy: {
      '/api': {
        target: 'http://localhost:2785',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:2785',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
