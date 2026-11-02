// Synthetic identity fixtures for integration tests (AS-009). Every name carries a random
// suffix, so tests can run repeatedly against the same database.
import { randomUUID } from 'node:crypto';
import type { ModuleCode, PermissionCode } from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';

const tenantCodes = new Map<string, string>();
const usernames = new Map<string, string>();
const hospitalCodes = new Map<string, string>();

/** The sign-in code of a person seeded in this test run (T-ACC-06). */
export function hospitalCodeOf(username: string): string {
  return hospitalCodes.get(username) ?? 'unknown-hospital';
}

/** For an account created through the API rather than a fixture. */
export function sameHospitalAs(username: string, colleague: string): void {
  hospitalCodes.set(username, hospitalCodeOf(colleague));
}

export async function seedTenant(prisma: PrismaClient, nameEn = 'Test Hospital'): Promise<string> {
  const tenantId = randomUUID();
  tenantCodes.set(tenantId, `test-${tenantId.slice(0, 8)}`);
  await withTenant(prisma, { tenantId }, (tx) =>
    tx.tenant.create({ data: { id: tenantId, code: `test-${tenantId.slice(0, 8)}`, nameEn } }),
  );
  return tenantId;
}

export interface SeedUserInput {
  passwordHash: string;
  username?: string;
  status?: 'ACTIVE' | 'LOCKED_TEMPORARY' | 'LOCKED_ADMIN' | 'DISABLED';
  lockedUntil?: Date;
}

export async function seedUser(
  prisma: PrismaClient,
  input: SeedUserInput,
): Promise<{ id: string; username: string }> {
  const username = input.username ?? `user-${randomUUID().slice(0, 8)}`;
  const user = await prisma.userAccount.create({
    data: {
      username,
      displayName: 'Test User',
      passwordHash: input.passwordHash,
      status: input.status ?? 'ACTIVE',
      lockedUntil: input.lockedUntil ?? null,
    },
  });
  usernames.set(user.id, username);
  return { id: user.id, username };
}

export async function seedMembership(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED' = 'ACTIVE',
): Promise<string> {
  const membership = await withTenant(prisma, { tenantId }, (tx) =>
    tx.membership.create({ data: { tenantId, userId, status } }),
  );
  const username = usernames.get(userId);
  const code = tenantCodes.get(tenantId);
  if (username && code) hospitalCodes.set(username, code);
  return membership.id;
}

/**
 * Gives a membership the listed permissions through a new role of its own (T-ACC-02). Codes
 * are typed against the catalogue, so a test cannot grant a code that does not exist.
 */
export async function grantPermissions(
  prisma: PrismaClient,
  tenantId: string,
  membershipId: string,
  codes: readonly PermissionCode[],
): Promise<string> {
  const role = await withTenant(prisma, { tenantId }, (tx) =>
    tx.role.create({
      data: {
        tenantId,
        code: `test-${randomUUID().slice(0, 8)}`,
        nameEn: 'Test role',
        permissions: { create: codes.map((permissionCode) => ({ permissionCode })) },
        memberships: { create: { membershipId } },
      },
    }),
  );
  return role.id;
}

/** Turns modules on for a hospital (FR-SAA-004); the core module needs no row. */
export async function seedEntitlements(
  prisma: PrismaClient,
  tenantId: string,
  modules: readonly ModuleCode[],
): Promise<void> {
  await withTenant(prisma, { tenantId }, (tx) =>
    tx.tenantEntitlement.createMany({
      data: modules.map((moduleCode) => ({ tenantId, moduleCode })),
    }),
  );
}
