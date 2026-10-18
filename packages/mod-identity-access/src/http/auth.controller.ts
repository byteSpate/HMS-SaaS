// /api/v1/auth endpoints (UC-ACC-01). The session token only ever travels in the HttpOnly
// cookie; the response body carries the CSRF token and what the UI needs to render.
import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  loginRequestSchema,
  selectMembershipRequestSchema,
  updatePreferencesRequestSchema,
  type LoginRequest,
  type SelectMembershipRequest,
  type SessionResponse,
  type UpdatePreferencesRequest,
} from '@hms/contracts';
import { ZodBodyPipe, type CorrelatedRequest } from '@hms/platform';
import { AuthService, type IssuedSession, type RequestMeta } from '../application/auth.service.js';
import { AllowWithoutTenant, Public } from './decorators.js';
import { getAuthContext, getSessionToken, type AuthenticatedRequest } from './request-context.js';
import {
  clearSessionCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
} from './session-cookie.js';

// The correlation ID was checked and set by requestIdMiddleware (T-PLT-07); it is absent only
// when the module runs without the API's request pipeline (some tests).
function metaOf(request: AuthenticatedRequest & CorrelatedRequest): RequestMeta {
  const { correlationId } = request;
  return {
    ...(request.ip ? { ipAddress: request.ip } : {}),
    ...(correlationId ? { correlationId } : {}),
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodBodyPipe(loginRequestSchema)) body: LoginRequest,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    return this.issue(response, await this.auth.login(body, metaOf(request)));
  }

  @AllowWithoutTenant()
  @Get('session')
  session(@Req() request: AuthenticatedRequest): Promise<SessionResponse> {
    return this.auth.describeSession(getAuthContext(request), getSessionToken(request));
  }

  @AllowWithoutTenant()
  @Post('session/membership')
  @HttpCode(200)
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
  updatePreferences(
    @Body(new ZodBodyPipe(updatePreferencesRequestSchema)) body: UpdatePreferencesRequest,
    @Req() request: AuthenticatedRequest,
  ): Promise<SessionResponse> {
    return this.auth.updatePreferences(getAuthContext(request), body, getSessionToken(request));
  }

  @AllowWithoutTenant()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(getAuthContext(request), metaOf(request));
    response.clearCookie(SESSION_COOKIE, clearSessionCookieOptions);
  }

  private issue(response: Response, issued: IssuedSession): SessionResponse {
    const absolute = new Date(issued.session.absoluteExpiresAt);
    response.cookie(SESSION_COOKIE, issued.token, sessionCookieOptions(absolute, new Date()));
    return issued.session;
  }
}
