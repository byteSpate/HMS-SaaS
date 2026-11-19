// The department worklist (T-ORD-02; FR-LAB-004, FR-ORD-004, FR-ORD-005; C-011). Today's orders
// waiting for a department or in progress, each with its patient and the payment state of its
// invoice line. The screen splits them: ELIGIBLE orders are ready to start, the rest await
// payment with the amount due. Reading never changes an order.
import { Inject, Injectable } from '@nestjs/common';
import type { DepartmentWorklist, DepartmentWorklistQuery } from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import { calendarDateIn, instantAt, type Clock } from '@hms/domain-kernel';
import { findPatientRefs } from '@hms/mod-patients';
import { PRISMA, requestScope } from '@hms/platform';
import { listDepartmentOrders } from '../infrastructure/service-order.repository.js';
import { CLINICAL_CLOCK, HOSPITAL_TIME_ZONE } from './context.js';
import { orderViews } from './order-views.js';

@Injectable()
export class DepartmentWorklistService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLINICAL_CLOCK) private readonly clock: Clock,
  ) {}

  list(query: DepartmentWorklistQuery): Promise<DepartmentWorklist> {
    const today = calendarDateIn(this.clock.now(), HOSPITAL_TIME_ZONE);
    const since = instantAt(today, '00:00', HOSPITAL_TIME_ZONE);
    return withTenant(this.prisma, requestScope(), async (tx) => {
      const stored = await listDepartmentOrders(tx, {
        since,
        ...(query.category ? { category: query.category } : {}),
      });
      const [views, patients] = await Promise.all([
        orderViews(tx, stored),
        findPatientRefs(
          tx,
          stored.map((order) => order.patientId),
        ),
      ]);
      const patientOf = new Map(stored.map((order) => [order.orderId, order.patientId]));
      return {
        orders: views.flatMap((view) => {
          const patient = patients.get(patientOf.get(view.orderId) ?? '');
          return patient ? [{ ...view, patient }] : [];
        }),
      };
    });
  }
}
