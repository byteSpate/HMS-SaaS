// Login, hospital selection and session payloads (UC-ACC-01, ADR-004, ADR-021).
import { z } from 'zod';

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(100),
  // The upper bound stops oversized inputs from reaching argon2 (CPU exhaustion).
  password: z.string().min(1).max(1024),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const selectMembershipRequestSchema = z.object({ membershipId: z.uuid() });
export type SelectMembershipRequest = z.infer<typeof selectMembershipRequestSchema>;

export const membershipSummarySchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  tenantNameEn: z.string().nullable(),
  tenantNameBn: z.string().nullable(),
});
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;

// T-ACC-04 (FR-ACC-006): whether the chosen hospital's roles need a second factor, whether the
// user has one, and whether this session has passed it. The UI uses it to route to the MFA
// screen; the API enforces it on every permission-guarded route (MFA_REQUIRED).
export const mfaStatusSchema = z.object({
  required: z.boolean(),
  enrolled: z.boolean(),
  verified: z.boolean(),
});
export type MfaStatus = z.infer<typeof mfaStatusSchema>;

export const sessionResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    displayName: z.string(),
    preferredLang: z.enum(['bn-BD', 'en']),
  }),
  memberships: z.array(membershipSummarySchema),
  activeMembershipId: z.uuid().nullable(),
  csrfToken: z.string().min(1),
  idleExpiresAt: z.iso.datetime(),
  absoluteExpiresAt: z.iso.datetime(),
  mfa: mfaStatusSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** Start of enrolment: the secret to add to an authenticator app, as text and as a key URI. */
export const mfaEnrolmentResponseSchema = z.object({
  secret: z.string().min(16),
  otpauthUri: z.string().startsWith('otpauth://totp/'),
});
export type MfaEnrolmentResponse = z.infer<typeof mfaEnrolmentResponseSchema>;

export const mfaCodeRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});
export type MfaCodeRequest = z.infer<typeof mfaCodeRequestSchema>;

/** Either a code from the app, or one recovery code when the phone is lost. */
export const mfaVerifyRequestSchema = z.union([
  mfaCodeRequestSchema,
  z.object({ recoveryCode: z.string().trim().min(10).max(20) }),
]);
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;

/** Confirmed enrolment: the new session and the recovery codes, shown to the user only once. */
export const mfaConfirmResponseSchema = z.object({
  session: sessionResponseSchema,
  recoveryCodes: z.array(z.string()).length(10),
});
export type MfaConfirmResponse = z.infer<typeof mfaConfirmResponseSchema>;

// FR-I18N-001: the interface language is a per-user preference stored on the server.
export const updatePreferencesRequestSchema = z.object({
  preferredLang: z.enum(['bn-BD', 'en']),
});
export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesRequestSchema>;
