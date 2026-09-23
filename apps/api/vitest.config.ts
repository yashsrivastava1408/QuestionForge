import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 10000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-key-1234567890',
      DATABASE_URL: 'postgresql://qforge:qforge_password@localhost:5432/question_forge',
      REDIS_URL: 'redis://localhost:6379',
      ENABLE_EMBEDDED_WORKERS: 'false',
    },
  },
});
