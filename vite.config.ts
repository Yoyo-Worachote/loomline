import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const serverPort = Number(process.env.SERVER_PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/public', emptyOutDir: true },
  server: {
    port: 5173,
    host: true,
    proxy: { '/ws': { target: `ws://127.0.0.1:${serverPort}`, ws: true }, '/healthz': `http://127.0.0.1:${serverPort}` },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 20000,
  },
});
