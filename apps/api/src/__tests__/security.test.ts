import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encryptSecret, decryptSecret, isEncrypted } from '../utils/crypto.js';
import { assertPublicHttpUrl, isPrivateAddress } from '../utils/urlSafety.js';
import { assertSecureConfig, isMockAuthEnabled } from '../utils/config.js';
import { extractJsonObject } from '../utils/json.js';
import { estimateCostUsd } from '../services/pricing.js';
import { modelFor } from '../services/llmService.js';

const KEY = 'a'.repeat(64);

describe('secret encryption (AES-256-GCM)', () => {
  beforeEach(() => vi.stubEnv('ENCRYPTION_KEY', KEY));
  afterEach(() => vi.unstubAllEnvs());

  it('round-trips and never stores the plaintext', () => {
    const stored = encryptSecret('sk-live-super-secret');
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain('sk-live-super-secret');
    expect(decryptSecret(stored)).toBe('sk-live-super-secret');
  });

  it('uses a fresh IV each time', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('detects tampering', () => {
    const stored = encryptSecret('secret');
    const parts = stored.split(':');
    parts[4] = Buffer.from('tampered').toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('cannot be decrypted with a different key', () => {
    const stored = encryptSecret('secret');
    vi.stubEnv('ENCRYPTION_KEY', 'b'.repeat(64));
    expect(() => decryptSecret(stored)).toThrow();
  });

  it('reads legacy plaintext values unchanged', () => {
    expect(decryptSecret('legacy-plain-secret')).toBe('legacy-plain-secret');
  });

  it('refuses to encrypt with a missing or malformed key', () => {
    vi.stubEnv('ENCRYPTION_KEY', '32_char_hex_string_for_aes_256');
    expect(() => encryptSecret('x')).toThrow(/ENCRYPTION_KEY/);
  });
});

describe('webhook URL SSRF guard', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
  ])('treats %s as private', (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111'])('treats %s as public', (ip) =>
    expect(isPrivateAddress(ip)).toBe(false));

  it.each([
    'http://127.0.0.1:6379/', 'http://localhost/hook', 'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/', 'http://10.0.0.5/internal', 'http://192.168.0.10:8080/x',
  ])('rejects %s', async (url) => {
    await expect(assertPublicHttpUrl(url)).rejects.toThrow(/public internet address/);
  });

  it('rejects non-http schemes and embedded credentials', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow();
    await expect(assertPublicHttpUrl('ftp://8.8.8.8/x')).rejects.toThrow();
    await expect(assertPublicHttpUrl('https://user:pass@8.8.8.8/x')).rejects.toThrow(/credentials/);
    await expect(assertPublicHttpUrl('not a url')).rejects.toThrow(/valid URL/);
  });

  it('accepts a public address', async () => {
    await expect(assertPublicHttpUrl('https://8.8.8.8/hook')).resolves.toBeInstanceOf(URL);
  });

  it('requires https in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(assertPublicHttpUrl('http://8.8.8.8/hook')).rejects.toThrow(/https/);
  });

  it('allows private targets only with the explicit dev flag, and never in production', async () => {
    vi.stubEnv('WEBHOOK_ALLOW_PRIVATE_TARGETS', 'true');
    await expect(assertPublicHttpUrl('http://localhost:9999/hook')).resolves.toBeInstanceOf(URL);
    vi.stubEnv('NODE_ENV', 'production');
    await expect(assertPublicHttpUrl('https://127.0.0.1/hook')).rejects.toThrow(/public internet address/);
  });
});

describe('boot-time config checks', () => {
  afterEach(() => vi.unstubAllEnvs());
  const prod = (overrides: Record<string, string> = {}) => {
    const env = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), ENCRYPTION_KEY: 'ab'.repeat(32), ALLOW_MOCK_AUTH: '', SANDBOX_DRIVER: '', ...overrides };
    Object.entries(env).forEach(([k, v]) => vi.stubEnv(k, v));
  };

  it('accepts a sound production config', () => {
    prod();
    expect(() => assertSecureConfig()).not.toThrow();
  });

  it.each([
    ['a short JWT secret', { JWT_SECRET: 'short' }, /JWT_SECRET/],
    ['the example JWT secret', { JWT_SECRET: 'change_this_to_a_long_random_string_in_production' }, /JWT_SECRET/],
    ['an all-zero encryption key', { ENCRYPTION_KEY: '0'.repeat(64) }, /ENCRYPTION_KEY/],
    ['mock auth', { ALLOW_MOCK_AUTH: 'true' }, /ALLOW_MOCK_AUTH/],
    ['the unsandboxed local runner', { SANDBOX_DRIVER: 'local' }, /SANDBOX_DRIVER/],
  ])('refuses to boot production with %s', (_name, overrides, pattern) => {
    prod(overrides);
    expect(() => assertSecureConfig()).toThrow(pattern);
  });

  it('mock auth needs the explicit flag and is impossible in production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ALLOW_MOCK_AUTH', '');
    expect(isMockAuthEnabled()).toBe(false);
    vi.stubEnv('ALLOW_MOCK_AUTH', 'true');
    expect(isMockAuthEnabled()).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    expect(isMockAuthEnabled()).toBe(false);
  });
});

describe('extractJsonObject', () => {
  it('parses plain JSON, fenced JSON, and JSON surrounded by prose', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('Sure! Here it is: {"a":{"b":"}"}} Hope that helps.')).toEqual({ a: { b: '}' } });
  });

  it('handles braces and escaped quotes inside strings', () => {
    expect(extractJsonObject('x {"code":"if (a) { return \\"{\\"; }"} y')).toEqual({ code: 'if (a) { return "{"; }' });
  });

  it('throws when there is no JSON object — it never invents a default', () => {
    expect(() => extractJsonObject('Looks good to me!')).toThrow();
    expect(() => extractJsonObject('{"a": 1')).toThrow();
  });
});

describe('estimateCostUsd', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('prices known models from measured tokens', () => {
    expect(estimateCostUsd('claude-opus-5-5', 1_000_000, 100_000)).toBe(6);
  });

  it('returns null rather than guessing for an unknown model', () => {
    expect(estimateCostUsd('gpt-4o', 1000, 1000)).toBeNull();
    expect(estimateCostUsd(undefined, 1000, 1000)).toBeNull();
  });

  it('uses operator-supplied prices when set', () => {
    vi.stubEnv('LLM_PRICE_INPUT_PER_MTOK', '1');
    vi.stubEnv('LLM_PRICE_OUTPUT_PER_MTOK', '2');
    expect(estimateCostUsd('gpt-4o', 1_000_000, 1_000_000)).toBe(3);
  });
});

describe('modelFor', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses the drafting model for reviews unless a review model is set', () => {
    vi.stubEnv('ANTHROPIC_MODEL', 'claude-opus-5-5');
    vi.stubEnv('ANTHROPIC_REVIEW_MODEL', '');
    expect(modelFor('anthropic', 'review')).toBe('claude-opus-5-5');
    vi.stubEnv('ANTHROPIC_REVIEW_MODEL', 'claude-haiku-4-5');
    expect(modelFor('anthropic', 'review')).toBe('claude-haiku-4-5');
    expect(modelFor('anthropic', 'draft')).toBe('claude-opus-5-5');
  });
});
