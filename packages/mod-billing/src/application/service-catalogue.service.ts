// Service catalogue (T-ORD-01; FR-ORD-001, FR-ORD-007, FR-CFG-001, FR-I18N-006; FR-AUD-001;
// SP-03). The administrator with admin.price.publish, who keeps the price list, lists, adds and
// edits the orderable services. Each change is one transaction with its audit event and a
// ServiceItemChanged outbox event. A new service is ordered only once it has a price in force.
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateServiceRequest,
  ServiceList,
  ServiceRecord,
  UpdateServiceRequest,
} from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import { DomainError, fieldError, tidyText, type Clock } from '@hms/domain-kernel';
import { PRISMA, recordChange, requestScope } from '@hms/platform';
import {
  findService,
  insertService,
  listServices,
  serviceCodeTaken,
  updateService,
  type ServiceValues,
} from '../infrastructure/service-item.repository.js';
import { BILLING_CLOCK } from './context.js';

const notFound = () => new DomainError('NOT_FOUND', 'Service not found');
const stale = (currentVersion: number) =>
  new DomainError('STALE_RECORD', 'Someone else changed this service; reload it', {
    currentVersion,
  });
const codeInUse = () => fieldError('code', 'Another item of this hospital has this code');

const valuesOf = (request: {
  nameBn?: string | null;
  nameEn?: string | null;
  directlyOrderable: boolean;
  reportHours: number | null;
}): ServiceValues => ({
  nameBn: tidyText(request.nameBn),
  nameEn: tidyText(request.nameEn),
  directlyOrderable: request.directlyOrderable,
  reportHours: request.reportHours,
});

/** Two first saves of one code at once: the unique index refuses the second. */
const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';

@Injectable()
export class ServiceCatalogueService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(BILLING_CLOCK) private readonly clock: Clock,
  ) {}

  async list(): Promise<ServiceList> {
    return { services: await withTenant(this.prisma, requestScope(), listServices) };
  }

  async create(request: CreateServiceRequest): Promise<ServiceRecord> {
    const scope = requestScope();
    const at = this.clock.now();
    try {
      return await withTenant(this.prisma, scope, async (tx) => {
        if (await serviceCodeTaken(tx, request.code)) throw codeInUse();
        const created = await insertService(tx, scope.tenantId, {
          ...valuesOf(request),
          code: request.code,
          category: request.category,
          at,
        });
        await recordChange(tx, scope, {
          action: 'billing.service.created',
          eventType: 'ServiceItemChanged',
          targetType: 'service_item',
          targetId: created.serviceItemId,
          details: { code: created.code, category: created.category, version: created.version },
        });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw codeInUse();
      throw error;
    }
  }

  update(serviceItemId: string, request: UpdateServiceRequest): Promise<ServiceRecord> {
    const scope = requestScope();
    const next = { ...valuesOf(request), active: request.active };
    return withTenant(this.prisma, scope, async (tx) => {
      const stored = await findService(tx, serviceItemId);
      if (!stored) throw notFound();
      if (stored.version !== request.expectedVersion) throw stale(stored.version);
      const changed = (Object.keys(next) as (keyof typeof next)[]).filter(
        (field) => stored[field] !== next[field],
      );
      if (changed.length === 0)
        throw fieldError('nameEn', 'Nothing differs from the current values');
      const target = {
        serviceItemId,
        expectedVersion: request.expectedVersion,
        at: this.clock.now(),
      };
      // A concurrent edit may have won since the read; the version check decides.
      if ((await updateService(tx, target, next)) === 0) throw stale(request.expectedVersion + 1);
      const version = request.expectedVersion + 1;
      await recordChange(tx, scope, {
        action: 'billing.service.changed',
        eventType: 'ServiceItemChanged',
        targetType: 'service_item',
        targetId: serviceItemId,
        details: { changedFields: changed.join(','), fromVersion: version - 1, toVersion: version },
      });
      return { ...stored, ...next, version };
    });
  }
}
