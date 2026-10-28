import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashRecoveryCode, newRecoveryCodes, normalizeRecoveryCode } from './recovery-codes.js';
import { openSecret, parseMfaKey, sealSecret } from './secret-box.js';
import { matchTotp, otpauthUri, timeStep, toBase32, totpAt } from './totp.js';

// RFC 6238 appendix B, SHA-1 secret; the RFC prints 8 digits, a 6-digit code is the last six.
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('TOTP (RFC 6238)', () => {
  it('matches the RFC test vectors', () => {
    expect(totpAt(RFC_SECRET, timeStep(new Date(59_000)))).toBe('287082');
    expect(totpAt(RFC_SECRET, timeStep(new Date(1_111_111_109_000)))).toBe('081804');
    expect(totpAt(RFC_SECRET, timeStep(new Date(1_234_567_890_000)))).toBe('005924');
  });

  it('accepts the current code and one step either side, and says which step matched', () => {
    const now = new Date(1_234_567_890_000);
    const step = timeStep(now);
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step), now)).toBe(step);
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 2), now)).toBeNull();
    expect(matchTotp(RFC_SECRET, '12345', now)).toBeNull();
  });

  it('encodes base32 as authenticator apps expect', () => {
    expect(toBase32(Buffer.from('foobar', 'ascii'))).toBe('MZXW6YTBOI');
  });

  it('builds an otpauth URI with issuer and account', () => {
    const uri = otpauthUri({ issuer: 'HMS', account: 'rahim', secret: RFC_SECRET });
    expect(uri).toBe(
      'otpauth://totp/HMS:rahim?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=HMS&algorithm=SHA1&digits=6&period=30',
    );
  });
});

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

  it('accepts only a 32-byte base64 key', () => {
    expect(parseMfaKey(randomBytes(32).toString('base64'))).toHaveLength(32);
    expect(() => parseMfaKey('short')).toThrow(/MFA_ENCRYPTION_KEY/);
  });
});

describe('recovery codes', () => {
  it('creates ten distinct codes in a readable format', () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/);
  });

  it('hashes the normalized code, so case and spaces do not matter', () => {
    expect(normalizeRecoveryCode(' ABCDE-FGHIJ ')).toBe('abcde-fghij');
    expect(normalizeRecoveryCode('abcdefghij')).toBe('abcde-fghij');
    expect(hashRecoveryCode('abcde-fghij').equals(hashRecoveryCode(' ABCDE FGHIJ'))).toBe(true);
  });
});
