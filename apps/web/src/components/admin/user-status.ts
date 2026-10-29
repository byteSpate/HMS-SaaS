// How a staff user's access state is shown (T-ACC-05; FR-ACC-010), shared by the users table and
// the details dialog so both always agree. Full catalog keys as literals, so the unused-key check
// can see them.
import type { AdminUser } from '@hms/contracts';
import type { StatusKind } from '@hms/ui';

export const MEMBERSHIP_BADGE = {
  ACTIVE: { status: 'active', labelKey: 'admin.membershipActive' },
  SUSPENDED: { status: 'attention', labelKey: 'admin.membershipSuspended' },
  REVOKED: { status: 'problem', labelKey: 'admin.membershipRevoked' },
  INVITED: { status: 'idle', labelKey: 'admin.membershipInvited' },
} as const satisfies Record<
  AdminUser['membershipStatus'],
  { status: StatusKind; labelKey: string }
>;

/** A temporary or administrator lock; a disabled account is shown separately. */
export function isLocked(user: AdminUser): boolean {
  return user.accountStatus === 'LOCKED_TEMPORARY' || user.accountStatus === 'LOCKED_ADMIN';
}

/** First letter of the name for the avatar; works for Bangla and Latin names alike. */
export function initial(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '?';
}
