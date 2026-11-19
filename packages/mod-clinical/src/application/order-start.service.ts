// Starting a service order in a department (T-ORD-02; FR-ORD-004, FR-BIL-003, FR-LAB-004,
// FR-RIS-002; UC-BIL-02 "Gate"; C-011, C-040; FR-AUD-001; SP-03). Staff with order.service.start
// move a REQUESTED order to IN_PROGRESS. In one transaction billing checks the order's invoice
// line FOR SHARE: an unpaid line is PAYMENT_NOT_ELIGIBLE with the amount due, and nothing changes.
// Audited with an OrderStarted event.
import { Inject, Injectable } from '@nestjs/common';
import type { ServiceOrder, StartOrderRequest } from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import { DomainError, type Clock } from '@hms/domain-kernel';
import { assertEligible } from '@hms/mod-billing';
import { PRISMA, recordChange, requestScope } from '@hms/platform';
import { assertStartable } from '../domain/service-order.js';
import { findOrder, markStarted } from '../infrastructure/service-order.repository.js';
import { CLINICAL_CLOCK } from './context.js';
import { orderViews } from './order-views.js';

@Injectable()
export class OrderStartService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLINICAL_CLOCK) private readonly clock: Clock,
  ) {}

  start(orderId: string, request: StartOrderRequest): Promise<ServiceOrder> {
    const scope = requestScope();
    const at = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      const order = await findOrder(tx, orderId);
      if (!order) throw new DomainError('NOT_FOUND', 'Order not found');
      assertStartable(order, request.expectedVersion);
      // The gate (FR-BIL-003): checked on the server at the moment of starting, never trusted
      // from the screen, and held FOR SHARE until this transaction commits.
      await assertEligible(tx, [order.invoiceLineId]);
      const changed = await markStarted(tx, {
        orderId,
        expectedVersion: request.expectedVersion,
        at,
      });
      if (changed === 0) {
        throw new DomainError('STALE_RECORD', 'The order changed elsewhere; reload it', {
          currentVersion: request.expectedVersion + 1,
        });
      }
      await recordChange(tx, scope, {
        action: 'clinical.order.started',
        eventType: 'OrderStarted',
        targetType: 'service_order',
        targetId: orderId,
        details: { visitId: order.visitId, invoiceLineId: order.invoiceLineId },
      });
      const saved = await findOrder(tx, orderId);
      if (!saved) throw new DomainError('NOT_FOUND', 'Order not found');
      const [view] = await orderViews(tx, [saved]);
      if (!view) throw new DomainError('NOT_FOUND', 'Order not found');
      return view;
    });
  }
}
