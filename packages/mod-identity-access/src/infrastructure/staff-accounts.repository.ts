// Staff accounts as choices for other modules' forms (T-CLI-01; FR-PRA-003: a practitioner may
// link to one account). Runs in the caller's withTenant() transaction, so RLS limits it to one
// hospital's memberships; an account of another hospital is never offered and never found.
import type { StaffAccountChoice } from '@hms/contracts';
import type { TenantTx } from '@hms/database';

const CHOICE = { user: { select: { id: true, username: true, displayName: true } } } as const;

type ChoiceRow = { user: { id: string; username: string; displayName: string } };

const toChoice = ({ user }: ChoiceRow): StaffAccountChoice => ({
  userId: user.id,
  username: user.username,
  displayName: user.displayName,
});

/** Accounts that may be linked now: an active membership and an account that is not disabled. */
const LINKABLE = { status: 'ACTIVE', user: { status: { not: 'DISABLED' } } } as const;

/** The linkable accounts of the hospital, by display name. */
export async function listStaffAccountChoices(tx: TenantTx): Promise<StaffAccountChoice[]> {
  const rows = await tx.membership.findMany({
    where: LINKABLE,
    select: CHOICE,
    orderBy: [{ user: { displayName: 'asc' } }, { user: { username: 'asc' } }],
  });
  return rows.map(toChoice);
}

/** Whether the account may be linked to a practitioner of the caller's hospital. */
export async function isLinkableStaffAccount(tx: TenantTx, userId: string): Promise<boolean> {
  const row = await tx.membership.findFirst({
    where: { userId, ...LINKABLE },
    select: { id: true },
  });
  return row !== null;
}

/**
 * The named accounts, linkable or not, keyed by user ID: a practitioner linked to an account that
 * was suspended later still shows which account it is.
 */
export async function findStaffAccountChoices(
  tx: TenantTx,
  userIds: readonly string[],
): Promise<Map<string, StaffAccountChoice>> {
  if (userIds.length === 0) return new Map();
  const rows = await tx.membership.findMany({
    where: { userId: { in: [...new Set(userIds)] } },
    select: CHOICE,
  });
  return new Map(rows.map((row) => [row.user.id, toChoice(row)]));
}
