import crypto from 'node:crypto';
import { AppError } from '../middleware/errorHandler.js';

const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new AppError(
      'ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate one with: openssl rand -hex 32',
      500
    );
  }
  return Buffer.from(hex, 'hex');
}

/** AES-256-GCM. Output: enc:v1:<iv>:<authTag>:<ciphertext>, all base64. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64')).join(':');
}

/**
 * Decrypts a value written by `encryptSecret`. Values without the prefix are
 * returned as-is: they are secrets stored before encryption-at-rest existed.
 */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const [iv, tag, ciphertext] = stored.slice(PREFIX.length).split(':').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}
