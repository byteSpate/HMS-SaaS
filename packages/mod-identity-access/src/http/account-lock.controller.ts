// /api/v1/admin/users/{userId}/lock and /unlock (T-ACC-03; UC-ACC-02; FR-ACC-004, FR-SUP-003).
// Hospital administrators only (admin.user.manage, C01 section 5); every change is audited.
import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  accountLockRequestSchema,
  accountLockStatusSchema,
  type AccountLockRequest,
  type AccountLockStatus,
} from '@hms/contracts';
import { ApiEndpoint, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { AccountLockService } from '../application/account-lock.service.js';
import {
  ADMIN_READ_ERRORS,
  ADMIN_WRITE_ERRORS,
  adminOf,
  idPipe,
  type AdminRequest,
} from './admin-request.js';
import { RequirePermission } from './decorators.js';

const userIdPipe = idPipe('User');
const STATUS = {
  status: 200,
  description: 'Lock state, reason, time, who locked, and the last 20 login events with IP',
  schema: accountLockStatusSchema,
} as const;

@ApiTags('admin: users')
@ApiCookieAuth(SESSION_SECURITY)
@ApiParam({ name: 'userId', format: 'uuid', description: 'A user of this hospital' })
@RequirePermission('admin.user.manage')
@Controller('admin/users/:userId')
export class AccountLockController {
  constructor(private readonly locks: AccountLockService) {}

  @Get('lock')
  @ApiEndpoint({
    summary: 'Lock diagnostics of a user',
    description: 'Why, when and by whom the account is locked (FR-ACC-004, FR-SUP-003).',
    success: STATUS,
    errors: [...ADMIN_READ_ERRORS, 'NOT_FOUND'],
  })
  status(
    @Param('userId', userIdPipe) userId: string,
    @Req() request: AdminRequest,
  ): Promise<AccountLockStatus> {
    return this.locks.status(adminOf(request), userId);
  }

  @Post('lock')
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Lock a user account',
    description:
      'An administrator lock has no end time; open sessions end at once. Not allowed on your ' +
      'own account or on a disabled one (UC-ACC-02).',
    body: accountLockRequestSchema,
    success: STATUS,
    errors: [...ADMIN_WRITE_ERRORS, 'NOT_FOUND', 'INVALID_TRANSITION'],
    csrf: true,
  })
  lock(
    @Param('userId', userIdPipe) userId: string,
    @Body(new ZodBodyPipe(accountLockRequestSchema)) body: AccountLockRequest,
    @Req() request: AdminRequest,
  ): Promise<AccountLockStatus> {
    return this.locks.lock(adminOf(request), userId, body.reason, request.correlationId);
  }

  @Post('unlock')
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Unlock a user account',
    description:
      'Ends a temporary or administrator lock and clears the failure counter. Not allowed on ' +
      'your own account; an account that is not locked answers INVALID_TRANSITION.',
    body: accountLockRequestSchema,
    success: STATUS,
    errors: [...ADMIN_WRITE_ERRORS, 'NOT_FOUND', 'INVALID_TRANSITION'],
    csrf: true,
  })
  unlock(
    @Param('userId', userIdPipe) userId: string,
    @Body(new ZodBodyPipe(accountLockRequestSchema)) body: AccountLockRequest,
    @Req() request: AdminRequest,
  ): Promise<AccountLockStatus> {
    return this.locks.unlock(adminOf(request), userId, body.reason, request.correlationId);
  }
}
