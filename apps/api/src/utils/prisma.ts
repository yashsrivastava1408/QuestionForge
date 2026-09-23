import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Singleton Prisma client with explicit connection pool configuration.
 *
 * connection_limit is set per-process (not per-replica). With 4 API replicas,
 * total connections = 4 × connection_limit. Keep this low when using a
 * shared RDS instance (default: 5 per replica).
 * Override via DATABASE_URL query param: ?connection_limit=5&pool_timeout=20
 */
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://qforge:qforge_password@localhost:5432/question_forge';

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    datasources: {
      db: {
        url: DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
