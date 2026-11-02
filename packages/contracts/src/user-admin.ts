// User, membership and role administration payloads (T-ACC-05; FR-ACC-007, FR-ACC-008,
// FR-ACC-010; SCR-22). Hospital administrators only; every change is audited by the API.
import { z } from 'zod';
import { permissionCodeSchema } from './permissions.js';
import { hospitalCodeSchema } from './auth.js';

/**
 * Product-fixed password minimums (FR-ACC-007). Length is the main defence (NIST SP 800-63B);
 * no composition rules. The API also refuses the username and the current password.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(1024);

/** Username rule; stored lower-case, so the schema lower-cases it. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._@-]{3,64}$/);

const reasonSchema = z.string().trim().min(3).max(500);

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/** Signed-out request for a new password (C-093). Same looseness as the login username. */
export const forgotPasswordRequestSchema = z.object({
  hospitalCode: hospitalCodeSchema,
  username: z.string().trim().min(1).max(100),
});
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const membershipStatusSchema = z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED']);
export type MembershipStatusCode = z.infer<typeof membershipStatusSchema>;

export const roleSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  nameEn: z.string(),
  nameBn: z.string().nullable(),
});
export type RoleSummary = z.infer<typeof roleSummarySchema>;

export const adminUserSchema = z.object({
  userId: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  accountStatus: z.enum(['ACTIVE', 'LOCKED_TEMPORARY', 'LOCKED_ADMIN', 'DISABLED']),
  lockedUntil: z.iso.datetime().nullable(),
  membershipId: z.uuid(),
  membershipStatus: membershipStatusSchema,
  roles: z.array(roleSummarySchema),
  mfaEnrolled: z.boolean(),
  mustChangePassword: z.boolean(),
  // C-093: when the person asked for a new password and nobody has set one yet.
  passwordResetRequestedAt: z.iso.datetime().nullable(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

/** The users of the hospital, and its roles to choose from when assigning (admin.user.manage). */
export const adminUserListSchema = z.object({
  users: z.array(adminUserSchema),
  roles: z.array(roleSummarySchema),
});
export type AdminUserList = z.infer<typeof adminUserListSchema>;

export const createUserRequestSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(200),
  temporaryPassword: passwordSchema,
  roleIds: z.array(z.uuid()).max(20),
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  temporaryPassword: passwordSchema,
  reason: reasonSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const setMembershipStatusRequestSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']),
  reason: reasonSchema,
});
export type SetMembershipStatusRequest = z.infer<typeof setMembershipStatusRequestSchema>;

export const setUserRolesRequestSchema = z.object({ roleIds: z.array(z.uuid()).max(20) });
export type SetUserRolesRequest = z.infer<typeof setUserRolesRequestSchema>;

export const resetMfaRequestSchema = z.object({ reason: reasonSchema });
export type ResetMfaRequest = z.infer<typeof resetMfaRequestSchema>;

export const adminRoleSchema = roleSummarySchema.extend({
  templateCode: z.string().nullable(),
  permissions: z.array(permissionCodeSchema),
  memberCount: z.number().int().nonnegative(),
});
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const roleTemplateSchema = z.object({
  code: z.string(),
  nameEn: z.string(),
  permissions: z.array(permissionCodeSchema),
});
export type RoleTemplateSummary = z.infer<typeof roleTemplateSchema>;

export const adminRoleListSchema = z.object({
  roles: z.array(adminRoleSchema),
  templates: z.array(roleTemplateSchema),
});
export type AdminRoleList = z.infer<typeof adminRoleListSchema>;

export const createRoleRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,31}$/),
  nameEn: z.string().trim().min(1).max(100),
  nameBn: z.string().trim().max(100).optional(),
  templateCode: z.string().max(10).optional(),
  permissions: z.array(permissionCodeSchema).max(200),
});
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;

export const setRolePermissionsRequestSchema = z.object({
  permissions: z.array(permissionCodeSchema).max(200),
});
export type SetRolePermissionsRequest = z.infer<typeof setRolePermissionsRequestSchema>;
