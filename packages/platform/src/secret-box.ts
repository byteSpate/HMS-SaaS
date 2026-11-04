// Secrets at rest (T-ACC-04 for TOTP secrets, T-PAT-03 for national IDs; D section 7.1, E section
// 5.2). AES-256-GCM, so a value that must be read back is never stored in the clear and a changed
// value is detected. The keys come from the environment and never reach the database: a stolen
// database copy or backup alone reveals nothing. Stored layout: 12-byte IV, 16-byte tag, ciphertext.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** A 32-byte key from base64; `variable` names the setting in the error. */
export function parseEncryptionKey(variable: string, base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`${variable} must be 32 bytes in base64 (openssl rand -base64 32)`);
  }
  return key;
}

/**
 * A separate key per purpose from one master key (HKDF-SHA256), so the encryption key and the
 * lookup-hash key differ and knowing one does not give the other.
 */
export function deriveKey(master: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), purpose, KEY_BYTES));
}

/**
 * HMAC-SHA256 of a value, for an exact lookup of an encrypted value. Without the key the hash
 * cannot be computed, so a short value such as an ID number cannot be found by trying them all.
 */
export function keyedHash(key: Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
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
