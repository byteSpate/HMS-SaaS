// Time-based one-time passwords (RFC 6238 over RFC 4226 HOTP) for the second factor
// (T-ACC-04; FR-ACC-006; ADR-004; D section 7.1). SHA-1, 6 digits and 30-second steps are what
// every common authenticator app supports. Written here (about 50 lines) instead of adding a
// dependency; the RFC test vectors are in mfa-crypto.spec.ts.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const STEP_SECONDS = 30;
const DIGITS = 6;
/** One step either side tolerates a phone clock that is up to 30 seconds off. */
const WINDOW_STEPS = 1;
const SECRET_BYTES = 20;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newTotpSecret(): Buffer {
  return randomBytes(SECRET_BYTES);
}

export function timeStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / STEP_SECONDS);
}

/** The 6-digit code for one time step (RFC 4226 section 5.3 dynamic truncation). */
export function totpAt(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', secret).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * The time step whose code matches, or null. The caller stores the step and refuses any step
 * at or before it, so a code cannot be used twice (AT-ACC-010).
 */
export function matchTotp(secret: Buffer, code: string, now: Date): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = timeStep(now);
  const given = Buffer.from(code);
  for (let step = current - WINDOW_STEPS; step <= current + WINDOW_STEPS; step += 1) {
    if (timingSafeEqual(Buffer.from(totpAt(secret, step)), given)) return step;
  }
  return null;
}

/** RFC 4648 base32 without padding, the form authenticator apps read. */
export function toBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/** Key URI for authenticator apps (shown as a QR code and as text). */
export function otpauthUri(input: { issuer: string; account: string; secret: Buffer }): string {
  const issuer = encodeURIComponent(input.issuer);
  const account = encodeURIComponent(input.account);
  const params = `secret=${toBase32(input.secret)}&issuer=${issuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
  return `otpauth://totp/${issuer}:${account}?${params}`;
}
