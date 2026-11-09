// Department master (T-PRA-02; FR-CFG-001, FR-I18N-006; FR-AUD-001; SP-03). The hospital
// administrator lists, adds and edits departments. Each change is one transaction with its audit
// event and a DepartmentChanged outbox event, for picker caches later. Lists read the table
// directly, so a saved department is in every list on the next request (FR-CFG-001).
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateDepartmentRequest,
  DepartmentList,
  DepartmentRecord,
  UpdateDepartmentRequest,
} from '@hms/contracts';
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import { DomainError, type Clock } from '@hms/domain-kernel';
import { appendOutboxEvent, PRISMA } from '@hms/platform';
import { changedDepartmentFields, departmentValuesOf } from '../domain/department.js';
import type { AdminRef } from '../infrastructure/account-lock.repository.js';
import {
  codeTaken,
  findDepartment,
  hospitalFacilityId,
  insertDepartment,
  listDepartments,
  updateDepartment,
} from '../infrastructure/department.repository.js';
import { auditAdminChange } from '../infrastructure/user-admin.repository.js';
import { CLOCK } from './auth.config.js';

const notFound = () => new DomainError('NOT_FOUND', 'Department not found');
const stale = (currentVersion: number) =>
  new DomainError('STALE_RECORD', 'Someone else changed this department; reload it', {
    currentVersion,
  });
const fieldError = (path: string, message: string) =>
  new DomainError('VALIDATION_FAILED', 'Request body is invalid', {
    fields: [{ path, message }],
  });
const codeInUse = () => fieldError('code', 'Another department of this hospital has this code');

function announce(tx: TenantTx, tenantId: string, department: DepartmentRecord): Promise<void> {
  return appendOutboxEvent(tx, {
    tenantId,
    eventType: 'DepartmentChanged',
    aggregateType: 'department',
    aggregateId: department.departmentId,
    payload: { departmentId: department.departmentId, version: department.version },
  });
}

@Injectable()
export class DepartmentAdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private scoped<T>(admin: AdminRef, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return withTenant(this.prisma, { tenantId: admin.tenantId, userId: admin.userId }, fn);
  }

  async list(admin: AdminRef): Promise<DepartmentList> {
    return { departments: await this.scoped(admin, listDepartments) };
  }

  async detail(admin: AdminRef, departmentId: string): Promise<DepartmentRecord> {
    const found = await this.scoped(admin, (tx) => findDepartment(tx, departmentId));
    if (!found) throw notFound();
    return found;
  }

  create(
    admin: AdminRef,
    request: CreateDepartmentRequest,
    correlationId?: string,
  ): Promise<DepartmentRecord> {
    const values = departmentValuesOf(request);
    return this.scoped(admin, async (tx) => {
      if (await codeTaken(tx, values.code)) throw codeInUse();
      const facilityId = await hospitalFacilityId(tx, admin.tenantId);
      const created = await insertDepartment(
        tx,
        { tenantId: admin.tenantId, facilityId, userId: admin.userId },
        values,
      );
      await auditAdminChange(tx, admin, 'department.created', 'department', created.departmentId, {
        ...(correlationId ? { correlationId } : {}),
        details: { code: created.code, version: created.version },
      });
      await announce(tx, admin.tenantId, created);
      return created;
    });
  }

  update(
    admin: AdminRef,
    departmentId: string,
    request: UpdateDepartmentRequest,
    correlationId?: string,
  ): Promise<DepartmentRecord> {
    const next = { ...departmentValuesOf(request), active: request.active };
    return this.scoped(admin, async (tx) => {
      const stored = await findDepartment(tx, departmentId);
      if (!stored) throw notFound();
      if (stored.version !== request.expectedVersion) throw stale(stored.version);

      const changed = changedDepartmentFields(stored, next);
      if (changed.length === 0) {
        throw fieldError('nameEn', 'Nothing differs from the current values');
      }
      if (changed.includes('code') && (await codeTaken(tx, next.code, departmentId))) {
        throw codeInUse();
      }
      const target = {
        departmentId,
        expectedVersion: request.expectedVersion,
        userId: admin.userId,
        at: this.clock.now(),
      };
      // A concurrent edit may have won since the read; the version check decides.
      if ((await updateDepartment(tx, target, next)) === 0) {
        throw stale(request.expectedVersion + 1);
      }

      const saved = { departmentId, ...next, version: request.expectedVersion + 1 };
      await auditAdminChange(tx, admin, 'department.changed', 'department', departmentId, {
        ...(correlationId ? { correlationId } : {}),
        details: {
          changedFields: changed.join(','),
          fromVersion: request.expectedVersion,
          toVersion: saved.version,
        },
      });
      await announce(tx, admin.tenantId, saved);
      return saved;
    });
  }
}
