// /api/v1/auth/mfa endpoints (T-ACC-04; FR-ACC-006; UC-ACC-01 step 3; AT-ACC-009, AT-ACC-010).
// They need a signed-in session but no hospital and no permission: they are how a privileged
// session earns its second factor. Each success sends a new session cookie (rotation).
import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  mfaCodeRequestSchema,
  mfaVerifyRequestSchema,
  type MfaCodeRequest,
  type MfaConfirmResponse,
  type MfaEnrolmentResponse,
  type MfaVerifyRequest,
  type SessionResponse,
} from '@hms/contracts';
import { ZodBodyPipe, type CorrelatedRequest } from '@hms/platform';
import type { RequestMeta } from '../application/auth.service.js';
import { MfaService } from '../application/mfa.service.js';
import { AllowWithoutTenant } from './decorators.js';
import { getAuthContext, type AuthenticatedRequest } from './request-context.js';
import { setSessionCookie } from './session-cookie.js';

type MfaRequest = AuthenticatedRequest & CorrelatedRequest;

function metaOf(request: MfaRequest): RequestMeta {
  return {
    ...(request.ip ? { ipAddress: request.ip } : {}),
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
  };
}

@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @AllowWithoutTenant()
  @Post('enrolment')
  @HttpCode(200)
  startEnrolment(@Req() request: MfaRequest): Promise<MfaEnrolmentResponse> {
    return this.mfa.startEnrolment(getAuthContext(request));
  }

  @AllowWithoutTenant()
  @Post('enrolment/confirm')
  @HttpCode(200)
  async confirmEnrolment(
    @Body(new ZodBodyPipe(mfaCodeRequestSchema)) body: MfaCodeRequest,
    @Req() request: MfaRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MfaConfirmResponse> {
    const ctx = getAuthContext(request);
    const confirmed = await this.mfa.confirmEnrolment(ctx, body.code, metaOf(request));
    setSessionCookie(response, confirmed.issued);
    return { session: confirmed.issued.session, recoveryCodes: confirmed.recoveryCodes };
  }

  @AllowWithoutTenant()
  @Post('verify')
  @HttpCode(200)
  async verify(
    @Body(new ZodBodyPipe(mfaVerifyRequestSchema)) body: MfaVerifyRequest,
    @Req() request: MfaRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const issued = await this.mfa.verify(getAuthContext(request), body, metaOf(request));
    setSessionCookie(response, issued);
    return issued.session;
  }
}
