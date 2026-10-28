// Wires authentication and authorization into the API: the service, the /auth controller and
// four global guards. Every route is refused unless marked @Public, @AllowWithoutTenant or
// @RequirePermission (T-ACC-02).
import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { systemClock, type Clock } from '@hms/domain-kernel';
import { AccountLockService } from './application/account-lock.service.js';
import { AUTH_CONFIG, CLOCK, type AuthConfig } from './application/auth.config.js';
import { AuthService } from './application/auth.service.js';
import { LOGIN_THROTTLE, LoginThrottle } from './application/login-throttle.js';
import { MfaService } from './application/mfa.service.js';
import { AccountLockController } from './http/account-lock.controller.js';
import { AuthController } from './http/auth.controller.js';
import { MfaController } from './http/mfa.controller.js';
import { ALLOWED_ORIGINS, CsrfGuard, SessionGuard, TenantGuard } from './http/guards.js';
import { PermissionGuard } from './http/permission.guard.js';

export interface IdentityAccessOptions {
  /** Exact web origins allowed to send writes (same list as CORS_ORIGINS). */
  allowedOrigins?: readonly string[];
}

@Module({})
export class IdentityAccessModule {
  static forRoot(
    config: AuthConfig,
    clock: Clock = systemClock,
    options: IdentityAccessOptions = {},
  ): DynamicModule {
    const allowedOrigins = new Set(options.allowedOrigins ?? ['http://localhost:3100']);
    return {
      module: IdentityAccessModule,
      controllers: [AuthController, MfaController, AccountLockController],
      providers: [
        AuthService,
        MfaService,
        AccountLockService,
        { provide: AUTH_CONFIG, useValue: config },
        { provide: LOGIN_THROTTLE, useValue: LoginThrottle.inMemory(config.loginRateLimits) },
        { provide: CLOCK, useValue: clock },
        { provide: ALLOWED_ORIGINS, useValue: allowedOrigins },
        // Order matters: session first, then CSRF (needs the session token), then tenant,
        // then permissions (need the hospital), as in D section 7.2.
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: TenantGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
      exports: [AuthService],
    };
  }
}
