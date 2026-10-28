// Loads what a membership may do in its hospital: granted permission codes (through its roles)
// and the hospital's module entitlements. T-ACC-02, FR-ACC-008, FR-SAA-004, D section 7.2.
// Read on every guarded request; the Valkey cache of D section 7.2 follows with T-PLT-03.
import {
  isPermissionCode,
  moduleCodeSchema,
  type ModuleCode,
  type PermissionCode,
} from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import { appendAuditEvent } from '@hms/platform';

export interface MembershipRef {
  tenantId: string;
  userId: string;
  membershipId: string;
}

export interface MembershipAccess {
  granted: ReadonlySet<PermissionCode>;
  entitledModules: ReadonlySet<ModuleCode>;
  /** Template codes of the membership's roles; decides the second factor (T-ACC-04). */
  roleTemplates: ReadonlySet<string>;
}

export interface AccessDenial extends MembershipRef {
  reason: string;
  route: string;
  required: readonly PermissionCode[];
  missing: readonly string[];
  correlationId?: string;
}

export async function loadMembershipAccess(
  prisma: PrismaClient,
  ref: MembershipRef,
): Promise<MembershipAccess> {
  return withTenant(prisma, { tenantId: ref.tenantId, userId: ref.userId }, async (tx) => {
    const grants = await tx.rolePermission.findMany({
      where: { role: { memberships: { some: { membershipId: ref.membershipId } } } },
      select: { permissionCode: true },
      distinct: ['permissionCode'],
    });
    const entitlements = await tx.tenantEntitlement.findMany({ select: { moduleCode: true } });
    const roles = await tx.role.findMany({
      where: { memberships: { some: { membershipId: ref.membershipId } } },
      select: { templateCode: true },
    });
    // A stored code that left the catalogue grants nothing (fail closed).
    const granted = grants.map((row) => row.permissionCode).filter(isPermissionCode);
    const entitledModules = entitlements.flatMap((row) => {
      const parsed = moduleCodeSchema.safeParse(row.moduleCode);
      return parsed.success ? [parsed.data] : [];
    });
    const roleTemplates = roles.flatMap((role) => (role.templateCode ? [role.templateCode] : []));
    return {
      granted: new Set(granted),
      entitledModules: new Set(entitledModules),
      roleTemplates: new Set(roleTemplates),
    };
  });
}

/**
 * Audits a refused request in its own short transaction (D section 7.3): there is no business
 * transaction to join, because the request never reached the handler.
 */
export async function recordAccessDenied(
  prisma: PrismaClient,
  denial: AccessDenial,
): Promise<void> {
  await withTenant(prisma, { tenantId: denial.tenantId, userId: denial.userId }, (tx) =>
    appendAuditEvent(tx, {
      tenantId: denial.tenantId,
      action: 'authz.access.denied',
      outcome: 'DENIED',
      actorUserId: denial.userId,
      membershipId: denial.membershipId,
      reason: denial.reason,
      ...(denial.correlationId ? { correlationId: denial.correlationId } : {}),
      details: {
        route: denial.route,
        required: denial.required.join(','),
        missing: denial.missing.join(','),
      },
    }),
  );
}
