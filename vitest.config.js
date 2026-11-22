import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['backend/tests/**/*.test.js'],
    environment: 'node',
    setupFiles: ['./backend/tests/setup.js'],
    fileParallelism: false,
    hookTimeout: 120000,
    testTimeout: 30000,
  },
});
