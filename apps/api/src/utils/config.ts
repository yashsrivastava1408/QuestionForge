import { logger } from './logger.js';

const WEAK_JWT_SECRETS = new Set([
  'secret',
  'change_me_in_production',
  'change_this_to_a_long_random_string_in_production',
]);

/** Dev-only shortcut: `Authorization: Bearer mock-token` acts as the first seeded admin. */
export function isMockAuthEnabled(): boolean {
  return process.env.ALLOW_MOCK_AUTH === 'true' && process.env.NODE_ENV !== 'production';
}

/**
 * Fails fast on configuration that would make the deployment insecure.
 * Called once at boot by both the API and the worker process.
 */
export function assertSecureConfig(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const problems: string[] = [];
  const jwtSecret = process.env.JWT_SECRET ?? '';

  if (!jwtSecret) problems.push('JWT_SECRET is not set.');

  if (isProd) {
    if (jwtSecret.length < 32 || WEAK_JWT_SECRETS.has(jwtSecret)) {
      problems.push('JWT_SECRET must be a random string of at least 32 characters in production.');
    }
    const encKey = process.env.ENCRYPTION_KEY ?? '';
    if (!/^[0-9a-fA-F]{64}$/.test(encKey) || /^0+$/.test(encKey)) {
      problems.push('ENCRYPTION_KEY must be 64 random hex characters in production (openssl rand -hex 32).');
    }
    if (process.env.ALLOW_MOCK_AUTH === 'true') {
      problems.push('ALLOW_MOCK_AUTH must not be enabled in production.');
    }
    if (process.env.SANDBOX_DRIVER === 'local') {
      problems.push('SANDBOX_DRIVER=local runs untrusted code without isolation and is not allowed in production.');
    }
  }

  if (problems.length > 0) {
    throw new Error(`Insecure configuration:\n - ${problems.join('\n - ')}`);
  }

  if (isMockAuthEnabled()) {
    logger.warn('[Config] ALLOW_MOCK_AUTH=true — "mock-token" is accepted as an ADMIN login. Never enable this on a shared host.');
  }
  if (process.env.SANDBOX_DRIVER === 'local') {
    logger.warn('[Config] SANDBOX_DRIVER=local — generated code runs on this machine with NO isolation.');
  }
}
