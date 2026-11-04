import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveKey, keyedHash, openSecret, parseEncryptionKey, sealSecret } from './secret-box.js';

// Secrets at rest (T-ACC-04, T-PAT-03): AES-256-GCM, derived keys and keyed lookup hashes.
describe('secret box (AES-256-GCM)', () => {
  const key = randomBytes(32);

  it('round-trips a secret and never stores it in the clear', () => {
    const secret = randomBytes(20);
    const sealed = sealSecret(key, secret);
    expect(sealed.includes(secret)).toBe(false);
    expect(openSecret(key, sealed).equals(secret)).toBe(true);
  });

  it('refuses a tampered value or the wrong key', () => {
    const sealed = sealSecret(key, randomBytes(20));
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(() => openSecret(key, tampered)).toThrow();
    expect(() => openSecret(randomBytes(32), sealed)).toThrow();
  });

  it('accepts only a 32-byte base64 key and names the setting', () => {
    expect(parseEncryptionKey('SOME_KEY', randomBytes(32).toString('base64'))).toHaveLength(32);
    expect(() => parseEncryptionKey('SOME_KEY', 'short')).toThrow(/SOME_KEY/);
  });
});

describe('derived keys and keyed hashes', () => {
  const master = randomBytes(32);

  it('gives a different 32-byte key per purpose, the same each time', () => {
    const encryption = deriveKey(master, 'nid-encryption');
    expect(encryption).toHaveLength(32);
    expect(deriveKey(master, 'nid-encryption').equals(encryption)).toBe(true);
    expect(deriveKey(master, 'nid-lookup').equals(encryption)).toBe(false);
  });

  it('hashes equal values equally, and differently under another key', () => {
    const lookup = deriveKey(master, 'nid-lookup');
    expect(keyedHash(lookup, '1234567890').equals(keyedHash(lookup, '1234567890'))).toBe(true);
    expect(keyedHash(lookup, '1234567890').equals(keyedHash(lookup, '1234567891'))).toBe(false);
    expect(keyedHash(randomBytes(32), '1234567890').equals(keyedHash(lookup, '1234567890'))).toBe(
      false,
    );
  });
});
