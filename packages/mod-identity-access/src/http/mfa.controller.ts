// /api/v1/auth/mfa endpoints (T-ACC-04; FR-ACC-006; UC-ACC-01 step 3; AT-ACC-009, AT-ACC-010).
// They need a signed-in session but no hospital and no permission: they are how a privileged
// session earns its second factor. Each success sends a new session cookie (rotation).
import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  mfaCodeRequestSchema,
  mfaConfirmResponseSchema,
  mfaEnrolmentResponseSchema,
  mfaVerifyRequestSchema,
  sessionResponseSchema,
  type MfaCodeRequest,
  type MfaConfirmResponse,
  type MfaEnrolmentResponse,
  type MfaVerifyRequest,
  type SessionResponse,
} from '@hms/contracts';
import { ApiEndpoint, SESSION_SECURITY, ZodBodyPipe, type CorrelatedRequest } from '@hms/platform';
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

const CODE_ERRORS = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'CSRF_TOKEN_INVALID',
  'MFA_CODE_INVALID',
  'INVALID_TRANSITION',
] as const;

@ApiTags('auth: second factor')
@ApiCookieAuth(SESSION_SECURITY)
@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @AllowWithoutTenant()
  @Post('enrolment')
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Start setting up the authenticator app',
    description:
      'Creates a new TOTP secret (replacing an unconfirmed one) and returns it as base32 text ' +
      'and as an `otpauth://` URI for a QR code. A confirmed factor is never replaced here; ' +
      'an administrator resets it (T-ACC-04, FR-ACC-006).',
    success: { status: 200, description: 'The new secret', schema: mfaEnrolmentResponseSchema },
    errors: ['UNAUTHENTICATED', 'CSRF_TOKEN_INVALID', 'INVALID_TRANSITION'],
    csrf: true,
  })
  startEnrolment(@Req() request: MfaRequest): Promise<MfaEnrolmentResponse> {
    return this.mfa.startEnrolment(getAuthContext(request));
  }

  @AllowWithoutTenant()
  @Post('enrolment/confirm')
  @HttpCode(200)
  @ApiEndpoint({
    summary: 'Confirm the authenticator app with its first code',
    description:
      'Turns the factor on, marks this session as verified and replaces it (new cookie). ' +
      'Returns ten single-use recovery codes, shown only this once. A wrong code counts ' +
      'towards the account lock.',
    body: mfaCodeRequestSchema,
    success: {
      status: 200,
      description: 'The verified session and the recovery codes',
      schema: mfaConfirmResponseSchema,
    },
    errors: CODE_ERRORS,
    csrf: true,
  })
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
  @ApiEndpoint({
    summary: 'Pass the second factor after sign-in',
    description:
      'Send `{ "code" }` from the app or `{ "recoveryCode" }`. A code from an already used ' +
      'time step and a used recovery code are refused; wrong codes count towards the account ' +
      'lock. Success replaces the session (new cookie, AT-ACC-009, AT-ACC-010).',
    body: mfaVerifyRequestSchema,
    success: { status: 200, description: 'The verified session', schema: sessionResponseSchema },
    errors: CODE_ERRORS,
    csrf: true,
  })
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
