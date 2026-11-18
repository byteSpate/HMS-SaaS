// Service orders (T-ORD-01; FR-ORD-002..005, FR-ORD-007, FR-ORD-008; UC-CLI-01 step 3; FR-AUD-001).
// The consultation's doctor orders services for the visit; each order is charged on the visit's
// SERVICE invoice in the same transaction and audited with a ServiceOrdered event. The pickers
// offer the active services the price list in force prices: all of them to doctors, only the
// directly orderable ones to reception (FR-ORD-001).
import { Inject, Injectable } from '@nestjs/common';
import type { OrderableServiceList, PlaceOrdersRequest, ServiceOrderList } from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import type { Clock } from '@hms/domain-kernel';
import { orderableServicesInForce } from '@hms/mod-billing';
import { PRISMA, requestScope } from '@hms/platform';
import { listOrdersOfVisit } from '../infrastructure/service-order.repository.js';
import { ownConsultation } from './clinical-documents.js';
import { CLINICAL_CLOCK } from './context.js';
import { placeOrders } from './order-placement.js';
import { orderViews } from './order-views.js';

@Injectable()
export class OrderService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLINICAL_CLOCK) private readonly clock: Clock,
  ) {}

  /** FR-ORD-008 type-ahead: what the doctor (all) or reception (direct only) may order now. */
  searchServices(text: string, directOnly: boolean): Promise<OrderableServiceList> {
    const scope = requestScope();
    const now = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => ({
      services: await orderableServicesInForce(tx, { text, directOnly }, now),
    }));
  }

  /** The visit's orders, read from the doctor's own consultation. */
  listForConsultation(consultationId: string): Promise<ServiceOrderList> {
    const scope = requestScope();
    return withTenant(this.prisma, scope, async (tx) => {
      const consultation = await ownConsultation(tx, scope, consultationId);
      return { orders: await orderViews(tx, await listOrdersOfVisit(tx, consultation.visitId)) };
    });
  }

  /** UC-CLI-01 step 3: the doctor's orders, from their own consultation. */
  placeForConsultation(
    consultationId: string,
    request: PlaceOrdersRequest,
  ): Promise<ServiceOrderList> {
    const scope = requestScope();
    const at = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      const consultation = await ownConsultation(tx, scope, consultationId);
      await placeOrders(
        tx,
        scope,
        {
          visitId: consultation.visitId,
          patientId: consultation.patientId,
          source: 'CONSULTATION',
          consultationId,
          requestingPractitionerId: consultation.practitionerId,
        },
        request.items,
        at,
      );
      return { orders: await orderViews(tx, await listOrdersOfVisit(tx, consultation.visitId)) };
    });
  }
}
