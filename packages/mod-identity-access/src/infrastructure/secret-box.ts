// Encrypts TOTP secrets at rest with AES-256-GCM (T-ACC-04; D section 7.1). Unlike a password
// the secret must be read back to check a code, so it cannot be hashed. The key comes from
// MFA_ENCRYPTION_KEY and never reaches the database; a stolen database copy alone cannot
// produce codes. Stored layout: 12-byte IV, 16-byte auth tag, ciphertext.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export function parseMfaKey(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error('MFA_ENCRYPTION_KEY must be 32 bytes in base64 (openssl rand -base64 32)');
  }
  return key;
}

export function sealSecret(key: Buffer, plain: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/** Throws when the value was changed or the key is wrong (GCM authentication). */
export function openSecret(key: Buffer, sealed: Buffer): Buffer {
  const iv = sealed.subarray(0, IV_BYTES);
  const tag = sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
}
