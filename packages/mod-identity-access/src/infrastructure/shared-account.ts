// Refuses account-wide changes on an account shared with another hospital (T-ACC-05 follow-up;
// C-094, ADR-003). The password, second factor and lock apply in every hospital the account belongs
// to, so an administrator of one hospital changing them could sign in to another.
import type { TenantTx } from '@hms/database';
import { DomainError } from '@hms/domain-kernel';

/** Throws inside the caller's transaction, so nothing it already did is kept. */
export async function assertAccountNotShared(tx: TenantTx, userId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ shared: boolean }[]>`
    SELECT hms.user_belongs_elsewhere(${userId}::uuid) AS shared`;
  if (rows[0]?.shared !== false) {
    throw new DomainError(
      'PERMISSION_DENIED',
      'This account also belongs to another hospital, so it cannot be changed here',
    );
  }
}
