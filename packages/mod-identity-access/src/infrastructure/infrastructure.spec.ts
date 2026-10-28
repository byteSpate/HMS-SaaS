import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '@hms/database';
import { seedMembership, seedTenant, seedUser } from '@hms/testkit';
import { unlockedState } from '../domain/lockout-policy.js';
import { csrfTokenFor, isValidCsrfToken } from './csrf-token.js';
import {
  applyFailedLogin,
  clearFailedLogins,
  findSessionByTokenHash,
  findUserByUsername,
  insertSession,
  listMembershipsForUser,
  revokeSession,
} from './identity.repository.js';
import { hashPassword, verifyPassword } from './password-hasher.js';
import { hashSessionToken, newSessionToken } from './session-token.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const SECRET_A = 'secret-a'.repeat(4);
const SECRET_B = 'secret-b'.repeat(4);

describe('password hasher', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'correct horse')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });
});

describe('session and CSRF tokens', () => {
  it('creates distinct tokens with a stable 32-byte hash', () => {
    const a = newSessionToken();
    expect(a).not.toBe(newSessionToken());
    expect(hashSessionToken(a)).toHaveLength(32);
    expect(Buffer.from(hashSessionToken(a)).equals(Buffer.from(hashSessionToken(a)))).toBe(true);
  });

  it('accepts only the CSRF token derived from the same session and secret', () => {
    const token = newSessionToken();
    const csrf = csrfTokenFor(token, SECRET_A);
    expect(isValidCsrfToken(token, csrf, SECRET_A)).toBe(true);
    expect(isValidCsrfToken(newSessionToken(), csrf, SECRET_A)).toBe(false);
    expect(isValidCsrfToken(token, csrf, SECRET_B)).toBe(false);
    expect(isValidCsrfToken(token, '', SECRET_A)).toBe(false);
  });
});

describe('identity repository', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient(databaseUrl);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('finds a user by username and applies a failed login under a row lock', async () => {
    const { id, username } = await seedUser(prisma, { passwordHash: 'x' });
    const seen = await applyFailedLogin(prisma, id, (current) => {
      expect(current).toEqual({ status: 'ACTIVE', failedAttempts: 0, lockedUntil: null });
      return unlockedState(current.failedAttempts + 1);
    });
    expect(seen?.failedAttempts).toBe(1);
    const user = await findUserByUsername(prisma, username);
    expect(user?.failedAttempts).toBe(1);
    await clearFailedLogins(prisma, id);
    expect((await findUserByUsername(prisma, username))?.failedAttempts).toBe(0);
  });

  it("lists the user's memberships with hospital names", async () => {
    const tenantId = await seedTenant(prisma, 'City Hospital');
    const { id: userId } = await seedUser(prisma, { passwordHash: 'x' });
    const membershipId = await seedMembership(prisma, tenantId, userId);
    const rows = await listMembershipsForUser(prisma, userId);
    expect(rows).toEqual([
      {
        id: membershipId,
        tenantId,
        status: 'ACTIVE',
        tenantNameEn: 'City Hospital',
        tenantNameBn: null,
      },
    ]);
  });

  it('stores, finds and revokes a session by token hash', async () => {
    const { id: userId } = await seedUser(prisma, { passwordHash: 'x' });
    const tokenHash = hashSessionToken(newSessionToken());
    const now = new Date();
    await insertSession(prisma, {
      tokenHash,
      userId,
      tenantId: null,
      membershipId: null,
      mfaVerifiedAt: null,
      createdAt: now,
      idleExpiresAt: new Date(now.getTime() + 60_000),
      absoluteExpiresAt: new Date(now.getTime() + 120_000),
    });
    expect((await findSessionByTokenHash(prisma, tokenHash))?.userId).toBe(userId);
    await revokeSession(prisma, tokenHash, now);
    expect((await findSessionByTokenHash(prisma, tokenHash))?.revokedAt).not.toBeNull();
  });
});
