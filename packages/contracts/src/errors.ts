// Stable error codes (C00 section 9) and their HTTP status (D section 8.3). The API returns
// them inside RFC 9457 problem+json bodies; the web app maps each code to a localized message.
import { z } from 'zod';

export const errorCodes = {
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  MFA_CODE_INVALID: 401,
  PERMISSION_DENIED: 403,
  MFA_REQUIRED: 403,
  CSRF_TOKEN_INVALID: 403,
  TENANT_NOT_SELECTED: 403,
  MEMBERSHIP_NOT_ACTIVE: 403,
  ENTITLEMENT_MISSING: 403,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  INVALID_TRANSITION: 409,
  VALIDATION_FAILED: 422,
  ACCOUNT_LOCKED: 423,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof errorCodes;

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  correlationId: z.string().optional(),
  fields: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type Problem = z.infer<typeof problemSchema>;
