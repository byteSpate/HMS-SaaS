// Global guards, in order: who is calling (session), is the write intended (CSRF + Origin),
// and is a hospital chosen (tenant). FR-ACC-001, FR-ACC-002, FR-ACC-009, ADR-021.
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError } from '@hms/domain-kernel';
import { bindRequestIdentity } from '@hms/platform';
import { AUTH_CONFIG, type AuthConfig } from '../application/auth.config.js';
import { AuthService } from '../application/auth.service.js';
import { isValidCsrfToken } from '../infrastructure/csrf-token.js';
import { ALLOW_WITHOUT_TENANT_KEY, PUBLIC_KEY } from './decorators.js';
import type { AuthenticatedRequest } from './request-context.js';
import { SESSION_COOKIE } from './session-cookie.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const ALLOWED_ORIGINS = Symbol('ALLOWED_ORIGINS');

function hasFlag(reflector: Reflector, key: string, context: ExecutionContext): boolean {
  const targets = [context.getHandler(), context.getClass()];
  return reflector.getAllAndOverride<boolean>(key, targets) === true;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (hasFlag(this.reflector, PUBLIC_KEY, context)) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length === 0) {
      throw new DomainError('UNAUTHENTICATED', 'Login required');
    }
    const ctx = await this.auth.resolveSession(token);
    if (!ctx) throw new DomainError('UNAUTHENTICATED', 'Login required');
    request.auth = ctx;
    request.sessionToken = token;
    // From here on, log lines and audit rows of this request carry the tenant and user (T-PLT-07).
    bindRequestIdentity(ctx);
    return true;
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(ALLOWED_ORIGINS) private readonly allowedOrigins: ReadonlySet<string>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_METHODS.has(request.method)) return true;
    // Browsers always send Origin on cross-origin writes; a foreign origin is refused even
    // with a valid token. The check also covers public routes (login): without it another
    // *.bytespate.com site could post a form that logs the victim into the attacker's account.
    // Non-browser clients without Origin still need the token (except on public routes).
    const origin = request.headers.origin;
    if (origin !== undefined && !this.allowedOrigins.has(origin)) {
      throw new DomainError('CSRF_TOKEN_INVALID', 'Request origin is not allowed');
    }
    if (hasFlag(this.reflector, PUBLIC_KEY, context)) return true;
    const candidate = request.headers['x-csrf-token'];
    const valid =
      typeof candidate === 'string' &&
      request.sessionToken !== undefined &&
      isValidCsrfToken(request.sessionToken, candidate, this.config.csrfSecret);
    if (!valid) throw new DomainError('CSRF_TOKEN_INVALID', 'CSRF token missing or invalid');
    return true;
  }
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      hasFlag(this.reflector, PUBLIC_KEY, context) ||
      hasFlag(this.reflector, ALLOW_WITHOUT_TENANT_KEY, context)
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth?.tenantId) {
      throw new DomainError('TENANT_NOT_SELECTED', 'Choose a hospital first');
    }
    return true;
  }
}
