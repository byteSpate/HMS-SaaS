// /api/v1/admin/users endpoints (T-ACC-05; FR-ACC-007, FR-ACC-008, FR-ACC-010; SCR-22):
// list and create users, temporary password, membership status, roles and second-factor reset.
// Hospital administrators only (admin.user.manage); every change is audited.
import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  adminUserListSchema,
  adminUserSchema,
  createUserRequestSchema,
  resetMfaRequestSchema,
  resetPasswordRequestSchema,
  setMembershipStatusRequestSchema,
  setUserRolesRequestSchema,
  type AdminUser,
  type AdminUserList,
  type CreateUserRequest,
  type ResetMfaRequest,
  type ResetPasswordRequest,
  type SetMembershipStatusRequest,
  type SetUserRolesRequest,
} from '@hms/contracts';
import { ApiEndpoint, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { UserAdminService } from '../application/user-admin.service.js';
import {
  ADMIN_READ_ERRORS,
  ADMIN_WRITE_ERRORS,
  adminOf,
  idPipe,
  type AdminRequest,
} from './admin-request.js';
import { RequirePermission } from './decorators.js';

const userIdPipe = idPipe('User');
const USER = { status: 200, description: 'The user after the change', schema: adminUserSchema };
const USER_PARAM = { name: 'userId', format: 'uuid', description: 'A user of this hospital' };
/** Changes to another person's account; never allowed on your own (UC-ACC-02). */
const CHANGE_ERRORS = [...ADMIN_WRITE_ERRORS, 'NOT_FOUND'] as const;

@ApiTags('admin: users')
@ApiCookieAuth(SESSION_SECURITY)
@RequirePermission('admin.user.manage')
@Controller('admin/users')
export class UserAdminController {
  constructor(private readonly users: UserAdminService) {}

  @Get()
  @ApiEndpoint({
    summary: 'List the users of this hospital',
    description: 'Each user with roles, access and lock state; also the roles to choose from.',
    success: { status: 200, description: 'Users and role choices', schema: adminUserListSchema },
    errors: ADMIN_READ_ERRORS,
  })
  list(@Req() request: AdminRequest): Promise<AdminUserList> {
    return this.users.list(adminOf(request));
  }

  @Post()
  @HttpCode(201)
  @ApiEndpoint({
    summary: 'Create a user with a temporary password',
    description:
      'Creates the account and its membership in this hospital with the given roles. The ' +
      'person must change the temporary password at first sign-in (FR-ACC-007). Passwords: ' +
      'at least 10 characters, not the username.',
    body: createUserRequestSchema,
    success: { status: 201, description: 'The new user', schema: adminUserSchema },
    errors: [...ADMIN_WRITE_ERRORS, 'USERNAME_TAKEN'],
    csrf: true,
  })
  create(
    @Body(new ZodBodyPipe(createUserRequestSchema)) body: CreateUserRequest,
    @Req() request: AdminRequest,
  ): Promise<AdminUser> {
    return this.users.create(adminOf(request), body, request.correlationId);
  }

  @Post(':userId/password')
  @HttpCode(200)
  @ApiParam(USER_PARAM)
  @ApiEndpoint({
    summary: 'Set a temporary password',
    description:
      'The person must change it at next sign-in; all open sessions of that person end. ' +
      'Needs a reason for the audit trail.',
    body: resetPasswordRequestSchema,
    success: USER,
    errors: CHANGE_ERRORS,
    csrf: true,
  })
  resetPassword(
    @Param('userId', userIdPipe) userId: string,
    @Body(new ZodBodyPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
    @Req() request: AdminRequest,
  ): Promise<AdminUser> {
    return this.users.resetPassword(
      adminOf(request),
      userId,
      body.temporaryPassword,
      body.reason,
      request.correlationId,
    );
  }

  @Post(':userId/membership')
  @HttpCode(200)
  @ApiParam(USER_PARAM)
  @ApiEndpoint({
    summary: 'Suspend, reactivate or revoke access to this hospital',
    description:
      'Leaving ACTIVE ends the sessions of that person here on their next request ' +
      '(FR-ACC-010, AT-ACC-011). REVOKED is final: going back answers INVALID_TRANSITION.',
    body: setMembershipStatusRequestSchema,
    success: USER,
    errors: [...CHANGE_ERRORS, 'INVALID_TRANSITION'],
    csrf: true,
  })
  setMembershipStatus(
    @Param('userId', userIdPipe) userId: string,
    @Body(new ZodBodyPipe(setMembershipStatusRequestSchema)) body: SetMembershipStatusRequest,
    @Req() request: AdminRequest,
  ): Promise<AdminUser> {
    return this.users.setMembershipStatus(adminOf(request), userId, body, request.correlationId);
  }

  @Put(':userId/roles')
  @ApiParam(USER_PARAM)
  @ApiEndpoint({
    summary: 'Replace the roles of a user',
    description: 'The new permissions apply on the next request of that person (FR-ACC-008).',
    body: setUserRolesRequestSchema,
    success: USER,
    errors: CHANGE_ERRORS,
    csrf: true,
  })
  setRoles(
    @Param('userId', userIdPipe) userId: string,
    @Body(new ZodBodyPipe(setUserRolesRequestSchema)) body: SetUserRolesRequest,
    @Req() request: AdminRequest,
  ): Promise<AdminUser> {
    return this.users.setRoles(adminOf(request), userId, body.roleIds, request.correlationId);
  }

  @Post(':userId/mfa/reset')
  @HttpCode(200)
  @ApiParam(USER_PARAM)
  @ApiEndpoint({
    summary: 'Reset a lost second factor',
    description:
      'Removes the authenticator and recovery codes and ends the sessions of that person; ' +
      'they set up the app again at next sign-in (T-ACC-04). A user without one answers ' +
      'INVALID_TRANSITION.',
    body: resetMfaRequestSchema,
    success: USER,
    errors: [...CHANGE_ERRORS, 'INVALID_TRANSITION'],
    csrf: true,
  })
  resetMfa(
    @Param('userId', userIdPipe) userId: string,
    @Body(new ZodBodyPipe(resetMfaRequestSchema)) body: ResetMfaRequest,
    @Req() request: AdminRequest,
  ): Promise<AdminUser> {
    return this.users.resetMfa(adminOf(request), userId, body.reason, request.correlationId);
  }
}
