// Pieces shared by the pharmacy routes (T-CLI-03): the errors the global guards answer before a
// route runs (Swagger documentation), and ID parsing that answers NOT_FOUND like any record the
// caller cannot see.
import { ParseUUIDPipe } from '@nestjs/common';
import type { ErrorCode } from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';

export const READ_ERRORS = [
  'UNAUTHENTICATED',
  'TENANT_NOT_SELECTED',
  'PERMISSION_DENIED',
  'ENTITLEMENT_MISSING',
] as const satisfies readonly ErrorCode[];

export const WRITE_ERRORS = [
  ...READ_ERRORS,
  'CSRF_TOKEN_INVALID',
  'VALIDATION_FAILED',
] as const satisfies readonly ErrorCode[];

export function idPipe(what: 'Medicine' | 'Prescribing term'): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () => new DomainError('NOT_FOUND', `${what} not found`),
  });
}
