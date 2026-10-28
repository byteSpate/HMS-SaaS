// Shared pieces of the hospital administration routes (T-ACC-03, T-ACC-05): who the
// administrator is, and ID parsing that answers NOT_FOUND like any record they cannot see.
import { ParseUUIDPipe } from '@nestjs/common';
import type { ErrorCode } from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import type { CorrelatedRequest } from '@hms/platform';
import type { AdminRef } from '../infrastructure/account-lock.repository.js';
import { getAuthContext, type AuthenticatedRequest } from './request-context.js';

export type AdminRequest = AuthenticatedRequest & CorrelatedRequest;

/**
 * What the global guards answer before an administration route runs (Swagger documentation):
 * no session, no hospital, a temporary password, no second factor, missing permission.
 */
export const ADMIN_READ_ERRORS = [
  'UNAUTHENTICATED',
  'TENANT_NOT_SELECTED',
  'PASSWORD_CHANGE_REQUIRED',
  'MFA_REQUIRED',
  'PERMISSION_DENIED',
] as const satisfies readonly ErrorCode[];

export const ADMIN_WRITE_ERRORS = [
  ...ADMIN_READ_ERRORS,
  'CSRF_TOKEN_INVALID',
  'VALIDATION_FAILED',
] as const satisfies readonly ErrorCode[];

export function adminOf(request: AdminRequest): AdminRef {
  const auth = getAuthContext(request);
  // PermissionGuard has already refused a session without a hospital; this narrows the types.
  if (!auth.tenantId || !auth.membershipId) {
    throw new DomainError('TENANT_NOT_SELECTED', 'Choose a hospital first');
  }
  return { tenantId: auth.tenantId, userId: auth.userId, membershipId: auth.membershipId };
}

/** A malformed ID is NOT_FOUND, like any other record the administrator cannot see. */
export function idPipe(what: 'User' | 'Role'): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () => new DomainError('NOT_FOUND', `${what} not found`),
  });
}
