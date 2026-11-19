// Direct diagnostic visits and orders at reception (T-VIS-02; UC-VIS-02 diagnostic path;
// FR-VIS-001, FR-ORD-001, FR-BIL-009; C-006). Reception opens a DIAGNOSTIC visit for a patient
// with directly orderable services in one transaction: the visit, the orders and their lines on
// the visit's service invoice. A service that needs a doctor is TEST_NOT_DIRECTLY_ORDERABLE and
// nothing is kept. Reception also lists the patient's orders in open visits, to cancel or pay.
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateDiagnosticVisitRequest,
  DiagnosticVisit,
  ServiceOrderList,
} from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import { fieldError, type Clock } from '@hms/domain-kernel';
import { hospitalFacilityId } from '@hms/mod-identity-access';
import { isBookablePatient } from '@hms/mod-patients';
import { PRISMA, recordChange, requestScope } from '@hms/platform';
import {
  listOrdersOfVisit,
  listOrdersOfVisits,
} from '../infrastructure/service-order.repository.js';
import { insertDiagnosticVisit, openVisitIdsOf } from '../infrastructure/visit.repository.js';
import { CLINICAL_CLOCK } from './context.js';
import { placeOrders } from './order-placement.js';
import { orderViews } from './order-views.js';

@Injectable()
export class DirectOrderService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLINICAL_CLOCK) private readonly clock: Clock,
  ) {}

  createDiagnosticVisit(request: CreateDiagnosticVisitRequest): Promise<DiagnosticVisit> {
    const scope = requestScope();
    const at = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      // RLS hides another hospital's patient, so it reads as unknown.
      if (!(await isBookablePatient(tx, request.patientId))) {
        throw fieldError('patientId', 'Choose a patient of this hospital');
      }
      const visit = await insertDiagnosticVisit(tx, {
        tenantId: scope.tenantId,
        facilityId: await hospitalFacilityId(tx, scope.tenantId),
        patientId: request.patientId,
        userId: scope.userId,
        at,
      });
      await recordChange(tx, scope, {
        action: 'clinical.visit.diagnostic_created',
        eventType: 'VisitOpened',
        targetType: 'visit',
        targetId: visit.id,
        details: { kind: 'DIAGNOSTIC', items: request.items.length },
      });
      await placeOrders(
        tx,
        scope,
        {
          visitId: visit.id,
          patientId: request.patientId,
          source: 'RECEPTION_DIRECT',
          consultationId: null,
          requestingPractitionerId: null,
        },
        request.items,
        at,
      );
      return {
        visitId: visit.id,
        patientId: request.patientId,
        arrivedAt: visit.arrivedAt.toISOString(),
        orders: await orderViews(tx, await listOrdersOfVisit(tx, visit.id)),
      };
    });
  }

  /** The patient's orders in their open visits: diagnostic and consultation ones alike. */
  ordersOfPatient(patientId: string): Promise<ServiceOrderList> {
    const scope = requestScope();
    return withTenant(this.prisma, scope, async (tx) => ({
      orders: await orderViews(
        tx,
        await listOrdersOfVisits(tx, await openVisitIdsOf(tx, patientId)),
      ),
    }));
  }
}
