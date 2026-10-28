// Prisma access for the TOTP second factor and recovery codes (T-ACC-04; FR-ACC-006;
// AT-ACC-009, AT-ACC-010). user_mfa is global like user_account: it is read before a hospital
// is chosen. Every "use once" rule is a conditional UPDATE, so two requests racing with the
// same code cannot both succeed.
import type { PrismaClient } from '@hms/database';

export interface MfaRecord {
  secretCiphertext: Buffer;
  enabledAt: Date | null;
}

export function findMfa(prisma: PrismaClient, userId: string): Promise<MfaRecord | null> {
  return prisma.userMfa
    .findUnique({ where: { userId }, select: { secretCiphertext: true, enabledAt: true } })
    .then((row) =>
      row
        ? { secretCiphertext: Buffer.from(row.secretCiphertext), enabledAt: row.enabledAt }
        : null,
    );
}

/**
 * Stores a new pending secret, replacing an earlier unconfirmed one. Returns false when the
 * user already has an enabled factor: replacing it needs an administrator reset (T-ACC-05).
 */
export async function savePendingMfa(
  prisma: PrismaClient,
  userId: string,
  secretCiphertext: Buffer,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.userMfa.deleteMany({ where: { userId, enabledAt: null } });
    const enabled = await tx.userMfa.findUnique({ where: { userId }, select: { userId: true } });
    if (enabled) return false;
    await tx.userMfa.create({
      data: { userId, secretCiphertext: Uint8Array.from(secretCiphertext) },
    });
    return true;
  });
}

/**
 * Confirms the enrolment with the step of the first accepted code, and replaces the recovery
 * codes, in one transaction. Returns false when there is no pending enrolment any more.
 */
export async function enableMfa(
  prisma: PrismaClient,
  userId: string,
  input: { now: Date; step: number; recoveryCodeHashes: Buffer[] },
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const enabled = await tx.userMfa.updateMany({
      where: { userId, enabledAt: null },
      data: { enabledAt: input.now, lastUsedStep: BigInt(input.step) },
    });
    if (enabled.count !== 1) return false;
    await tx.userMfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.userMfaRecoveryCode.createMany({
      data: input.recoveryCodeHashes.map((hash) => ({ userId, codeHash: Uint8Array.from(hash) })),
    });
    return true;
  });
}

/** Records the step of an accepted code; false when that step (or a later one) was used. */
export async function consumeTotpStep(
  prisma: PrismaClient,
  userId: string,
  step: number,
): Promise<boolean> {
  const updated = await prisma.userMfa.updateMany({
    where: {
      userId,
      enabledAt: { not: null },
      OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(step) } }],
    },
    data: { lastUsedStep: BigInt(step) },
  });
  return updated.count === 1;
}

/** Marks one unused recovery code as used; false when it does not exist or was used. */
export async function consumeRecoveryCode(
  prisma: PrismaClient,
  userId: string,
  codeHash: Buffer,
  now: Date,
): Promise<boolean> {
  const updated = await prisma.userMfaRecoveryCode.updateMany({
    where: { userId, codeHash: Uint8Array.from(codeHash), usedAt: null },
    data: { usedAt: now },
  });
  return updated.count === 1;
}
