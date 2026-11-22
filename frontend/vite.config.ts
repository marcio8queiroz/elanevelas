import { defineConfig } from 'vitest/config';
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/v1': { target: 'http://127.0.0.1:3000', changeOrigin: false },
    },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/tests/setup.ts'], restoreMocks: true },
});
