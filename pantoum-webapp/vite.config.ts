import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import ports from './shared/ports.json';

export default defineConfig({
  root: 'app',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
    port: ports.devPort,
    proxy: {
      '/api': {
        target: `http://localhost:${ports.apiPort}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${ports.apiPort}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: '../dist/app',
    emptyOutDir: true,
  },
});
