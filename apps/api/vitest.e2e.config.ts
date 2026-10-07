import { defineConfig } from 'vitest/config';

/**
 * End-to-end suite: the real Express app, real BullMQ workers, real Postgres and
 * Redis, and real code execution through the local sandbox driver. Only the LLM
 * is scripted (so the suite is free and deterministic).
 *
 * It needs a disposable database — it TRUNCATES every table. Point it at one
 * explicitly:
 *
 *   E2E_DATABASE_URL=postgresql://qforge:qforge_password@localhost:5432/question_forge_e2e \
 *   E2E_REDIS_URL=redis://localhost:6379/15 \
 *   npm run test:e2e --workspace=apps/api
 */
const databaseUrl = process.env.E2E_DATABASE_URL;
const redisUrl = process.env.E2E_REDIS_URL;
if (!databaseUrl || !redisUrl) {
  throw new Error('E2E_DATABASE_URL and E2E_REDIS_URL must be set (a disposable database — the suite truncates it).');
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.e2e.ts'],
    testTimeout: 180_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      JWT_SECRET: 'e2e-jwt-secret-0123456789-0123456789-abcdef',
      ENCRYPTION_KEY: '6f'.repeat(32),
      SANDBOX_DRIVER: 'local',
      ALLOW_MOCK_AUTH: 'false',
      ENABLE_EMBEDDED_WORKERS: 'false',
      WORKER_CONCURRENCY: '4',
      VALIDATION_RANDOM_CASES: '6',
      VALIDATION_EDGE_CASES: '4',
      GENERATION_RETRY_DELAY_MS: '200',
      LLM_RETRY_BASE_MS: '10',
      RATE_LIMIT_MAX_REQUESTS: '100000',
      GENERATE_RATE_LIMIT_PER_MIN: '1000',
      EXPORT_STORAGE: 'local',
      S3_BUCKET_NAME: '',
      // The LLM is scripted; make sure no real key can be picked up from the shell.
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      GOOGLE_GEMINI_API_KEY: '',
    },
  },
});
