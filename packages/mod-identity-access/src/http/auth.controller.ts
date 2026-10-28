// /api/v1/auth endpoints (UC-ACC-01; own password change T-ACC-05). The session token only
// ever travels in the HttpOnly cookie; the response body carries the CSRF token and what the UI
// needs to render. Swagger documentation comes from the same contracts (ApiEndpoint).
import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  selectMembershipRequestSchema,
  sessionResponseSchema,
  updatePreferencesRequestSchema,
  type ChangePasswordRequest,
  type LoginRequest,
  type SelectMembershipRequest,
  type SessionResponse,
  type UpdatePreferencesRequest,
} from '@hms/contracts';
import { ApiEndpoint, SESSION_SECURITY, ZodBodyPipe, type CorrelatedRequest } from '@hms/platform';
import { AuthService, type IssuedSession, type RequestMeta } from '../application/auth.service.js';
import { AllowWithoutTenant, Public } from './decorators.js';
import { getAuthContext, getSessionToken, type AuthenticatedRequest } from './request-context.js';
import { clearSessionCookieOptions, SESSION_COOKIE, setSessionCookie } from './session-cookie.js';

// The correlation ID was checked and set by requestIdMiddleware (T-PLT-07); it is absent only
// when the module runs without the API's request pipeline (some tests).
function metaOf(request: AuthenticatedRequest & CorrelatedRequest): RequestMeta {
  const { correlationId } = request;
  return {
    ...(request.ip ? { ipAddress: request.ip } : {}),
    ...(correlationId ? { correlationId } : {}),
  };
}

const SESSION = {
  status: 200,
  description: 'The session (a new session cookie is set when the session is replaced)',
  schema: sessionResponseSchema,
} as const;

@ApiTags('auth')
@ApiCookieAuth(SESSION_SECURITY)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Sign in with username and password',
    description:
      'Starts a session and sets the HttpOnly `__Host-hms_session` cookie. Use the returned ' +
      '`csrfToken` as the `X-CSRF-Token` header on every later write. With one hospital it is ' +
      'chosen automatically. Five wrong passwords lock the account for 15 minutes; the account ' +
      'and the client IP are rate limited (T-ACC-03).',
    body: loginRequestSchema,
    success: SESSION,
    errors: [
      'VALIDATION_FAILED',
      'INVALID_CREDENTIALS',
      'ACCOUNT_LOCKED',
      'MEMBERSHIP_NOT_ACTIVE',
      'RATE_LIMITED',
      'CSRF_TOKEN_INVALID',
      'SERVICE_UNAVAILABLE',
    ],
  })
  async login(
    @Body(new ZodBodyPipe(loginRequestSchema)) body: LoginRequest,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    return this.issue(response, await this.auth.login(body, metaOf(request)));
  }

  @AllowWithoutTenant()
  @Get('session')
  @ApiEndpoint({
    summary: 'Current session',
    description:
      'Who is signed in, their hospitals, permissions, second-factor and password-change ' +
      'state, and a fresh CSRF token.',
    success: { ...SESSION, description: 'The session' },
    errors: ['UNAUTHENTICATED'],
  })
  session(@Req() request: AuthenticatedRequest): Promise<SessionResponse> {
    return this.auth.describeSession(getAuthContext(request), getSessionToken(request));
  }

  @AllowWithoutTenant()
  @Post('session/membership')
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Choose or switch hospital',
    description: 'Replaces the session with one bound to the chosen membership (new cookie).',
    body: selectMembershipRequestSchema,
    success: SESSION,
    errors: ['VALIDATION_FAILED', 'UNAUTHENTICATED', 'CSRF_TOKEN_INVALID', 'NOT_FOUND'],
    csrf: true,
  })
  async selectMembership(
    @Body(new ZodBodyPipe(selectMembershipRequestSchema)) body: SelectMembershipRequest,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const ctx = getAuthContext(request);
    const issued = await this.auth.selectMembership(ctx, body.membershipId, metaOf(request));
    return this.issue(response, issued);
  }

  @AllowWithoutTenant()
  @Patch('preferences')
  @ApiEndpoint({
    summary: 'Save the interface language',
    body: updatePreferencesRequestSchema,
    success: { ...SESSION, description: 'The session with the new preference' },
    errors: ['VALIDATION_FAILED', 'UNAUTHENTICATED', 'CSRF_TOKEN_INVALID'],
    csrf: true,
  })
  updatePreferences(
    @Body(new ZodBodyPipe(updatePreferencesRequestSchema)) body: UpdatePreferencesRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<SessionResponse> {
    return this.auth.updatePreferences(getAuthContext(request), body, getSessionToken(request));
  }

  // T-ACC-05 (FR-ACC-007): the user's own password change, also the way out of a forced change.
  @AllowWithoutTenant()
  @Post('password')
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Change your own password',
    description:
      'Also clears a temporary password set by an administrator. Other sessions of the user ' +
      'end and this one is replaced (new cookie). A wrong current password is a field error ' +
      'and counts towards the account lock (T-ACC-05, FR-ACC-007).',
    body: changePasswordRequestSchema,
    success: SESSION,
    errors: ['VALIDATION_FAILED', 'UNAUTHENTICATED', 'CSRF_TOKEN_INVALID'],
    csrf: true,
  })
  async changePassword(
    @Body(new ZodBodyPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const issued = await this.auth.changePassword(getAuthContext(request), body, metaOf(request));
    return this.issue(response, issued);
  }

  @AllowWithoutTenant()
  @Post('logout')
  @HttpCode(204)
  @ApiEndpoint({
    summary: 'Sign out',
    description: 'Revokes the session and clears the cookie.',
    success: { status: 204, description: 'Signed out' },
    errors: ['UNAUTHENTICATED', 'CSRF_TOKEN_INVALID'],
    csrf: true,
  })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(getAuthContext(request), metaOf(request));
    response.clearCookie(SESSION_COOKIE, clearSessionCookieOptions);
  }

  private issue(response: Response, issued: IssuedSession): SessionResponse {
    setSessionCookie(response, issued);
    return issued.session;
  }
}
