// Global route permission guard, after SessionGuard, CsrfGuard and TenantGuard (D section 7.2
// steps 3 and 4). T-ACC-02, FR-ACC-009, FR-SAA-004; the second factor is T-ACC-04. Default deny:
// a handler without a marker is refused, so a forgotten decorator can never open a route.
// Every refusal is audited.
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { evaluateAccess, requiresSecondFactor } from '@hms/authz';
import type { PermissionCode } from '@hms/contracts';
import type { PrismaClient } from '@hms/database';
import { DomainError } from '@hms/domain-kernel';
import { getRequestContext, PRISMA } from '@hms/platform';
import {
  loadMembershipAccess,
  recordAccessDenied,
  type MembershipRef,
} from '../infrastructure/access.repository.js';
import { getAuthContext, type AuthenticatedRequest } from './request-context.js';
import { readRouteMarker } from './route-markers.js';

const DENIED = 'You do not have permission to do this';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const controller = context.getClass();
    const handler = context.getHandler();
    const marker = readRouteMarker(this.reflector, handler, controller);
    if (marker.kind === 'public' || marker.kind === 'without-tenant') return true;

    const auth = getAuthContext(context.switchToHttp().getRequest<AuthenticatedRequest>());
    // TenantGuard has already refused a session without a hospital; this narrows the types.
    if (!auth.tenantId || !auth.membershipId) {
      throw new DomainError('TENANT_NOT_SELECTED', 'Choose a hospital first');
    }
    const ref = { tenantId: auth.tenantId, userId: auth.userId, membershipId: auth.membershipId };
    const route = `${controller.name}.${handler.name}`;

    if (marker.kind === 'none') {
      await this.deny(ref, route, 'NO_ROUTE_MARKER', [], []);
      throw new DomainError('PERMISSION_DENIED', DENIED);
    }

    const access = await loadMembershipAccess(this.prisma, ref);
    // T-ACC-04 (FR-ACC-006, C-032): a privileged membership may do nothing behind a permission
    // until this session has passed the second factor; hiding screens is not a control.
    if (requiresSecondFactor(access) && auth.mfaVerifiedAt === null) {
      await this.deny(ref, route, 'MFA_REQUIRED', marker.codes, []);
      throw new DomainError('MFA_REQUIRED', 'Confirm the second factor first');
    }
    const decision = evaluateAccess({ required: marker.codes, ...access });
    if (decision.allowed) return true;
    if (decision.code === 'ENTITLEMENT_MISSING') {
      await this.deny(ref, route, decision.code, marker.codes, decision.missingModules);
      throw new DomainError(decision.code, 'This hospital does not use this module');
    }
    await this.deny(ref, route, decision.code, marker.codes, decision.missingPermissions);
    throw new DomainError(decision.code, DENIED);
  }

  private deny(
    ref: MembershipRef,
    route: string,
    reason: string,
    required: readonly PermissionCode[],
    missing: readonly string[],
  ): Promise<void> {
    const correlationId = getRequestContext()?.correlationId;
    return recordAccessDenied(this.prisma, {
      ...ref,
      route,
      reason,
      required,
      missing,
      ...(correlationId ? { correlationId } : {}),
    });
  }
}
