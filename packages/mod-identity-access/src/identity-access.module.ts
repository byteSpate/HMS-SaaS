// Wires authentication and authorization into the API: the service, the /auth controller and
// four global guards. Every route is refused unless marked @Public, @AllowWithoutTenant or
// @RequirePermission (T-ACC-02).
import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { systemClock, type Clock } from '@hms/domain-kernel';
import { AccountLockService } from './application/account-lock.service.js';
import { AUTH_CONFIG, CLOCK, type AuthConfig } from './application/auth.config.js';
import { AuthService } from './application/auth.service.js';
import { DepartmentAdminService } from './application/department-admin.service.js';
import { LOGIN_THROTTLE, LoginThrottle } from './application/login-throttle.js';
import { MfaService } from './application/mfa.service.js';
import { RoleAdminService } from './application/role-admin.service.js';
import { UserAdminService } from './application/user-admin.service.js';
import { AccountLockController } from './http/account-lock.controller.js';
import { AuditController } from './http/audit.controller.js';
import { AuthController } from './http/auth.controller.js';
import { DepartmentAdminController } from './http/department-admin.controller.js';
import { MfaController } from './http/mfa.controller.js';
import { RoleAdminController } from './http/role-admin.controller.js';
import { UserAdminController } from './http/user-admin.controller.js';
import { ALLOWED_ORIGINS, CsrfGuard, SessionGuard, TenantGuard } from './http/guards.js';
import { PermissionGuard } from './http/permission.guard.js';
import { SESSION_RATE_LIMITER, SessionRateLimitGuard } from './http/session-rate-limit.guard.js';
import { createRateLimiterFactory, type RateLimiterFactory } from '@hms/platform';
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { DEFAULT_API_RATE_LIMIT } from './application/auth.config.js';

const RATE_LIMITERS = Symbol('RATE_LIMITERS');

/** Closes the shared rate limit connection with the app. */
@Injectable()
class RateLimitersLifecycle implements OnApplicationShutdown {
  constructor(@Inject(RATE_LIMITERS) private readonly limiters: RateLimiterFactory) {}

  onApplicationShutdown(): Promise<void> {
    return this.limiters.close();
  }
}

export interface IdentityAccessOptions {
  /** Exact web origins allowed to send writes (same list as CORS_ORIGINS). */
  allowedOrigins?: readonly string[];
  /** Shared rate limits; without it they are per process (T-PLT-07 part 2). */
  valkeyUrl?: string;
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
      controllers: [
        AuthController,
        MfaController,
        AccountLockController,
        AuditController,
        UserAdminController,
        RoleAdminController,
        DepartmentAdminController,
      ],
      providers: [
        AuthService,
        MfaService,
        AccountLockService,
        UserAdminService,
        RoleAdminService,
        DepartmentAdminService,
        { provide: AUTH_CONFIG, useValue: config },
        {
          provide: RATE_LIMITERS,
          useFactory: () =>
            createRateLimiterFactory(options.valkeyUrl, (message) =>
              new Logger('RateLimit').warn(message),
            ),
        },
        RateLimitersLifecycle,
        {
          provide: LOGIN_THROTTLE,
          inject: [RATE_LIMITERS],
          useFactory: (limiters: RateLimiterFactory) =>
            LoginThrottle.from(limiters, config.loginRateLimits),
        },
        {
          provide: SESSION_RATE_LIMITER,
          inject: [RATE_LIMITERS],
          useFactory: (limiters: RateLimiterFactory) =>
            limiters.limiter('api-session', config.apiRateLimit ?? DEFAULT_API_RATE_LIMIT),
        },
        { provide: CLOCK, useValue: clock },
        { provide: ALLOWED_ORIGINS, useValue: allowedOrigins },
        // Order matters: session first, then CSRF (needs the session token), then tenant,
        // then permissions (need the hospital), as in D section 7.2.
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: TenantGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
        { provide: APP_GUARD, useClass: SessionRateLimitGuard },
      ],
      exports: [AuthService],
    };
  }
}
