// Display names of staff accounts (T-PLT-02 audit search, T-BIL-03 cashier sessions, T-BIL-04
// receipts). Runs in the caller's withTenant() transaction, so RLS limits it to one hospital's
// accounts; an ID of another hospital is simply missing from the map.
import type { TenantTx } from '@hms/database';

export async function findStaffNames(
  tx: TenantTx,
  userIds: readonly (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const users = await tx.userAccount.findMany({
    where: { id: { in: ids } },
    select: { id: true, displayName: true },
  });
  return new Map(users.map((user) => [user.id, user.displayName]));
}
