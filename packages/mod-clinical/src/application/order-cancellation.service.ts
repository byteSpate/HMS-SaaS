// Cancelling a service order (T-ORD-03; UC-ORD-02 interim rule; FR-ORD-006, FR-BIL-020; Q-017;
// FR-AUD-001; SP-03). Staff with order.service.cancel (doctor, reception) cancel a REQUESTED order
// with a reason. In one transaction billing cancels its unpaid line (the invoice total drops) and
// the order becomes CANCELLED; a paid line or started work is FEATURE_NOT_AVAILABLE and nothing
// changes. Audited with an OrderCancelled event.
import { Inject, Injectable } from '@nestjs/common';
import type { CancelOrderRequest, ServiceOrder } from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import { DomainError, type Clock } from '@hms/domain-kernel';
import { cancelUnpaidLine } from '@hms/mod-billing';
import { PRISMA, recordChange, requestScope } from '@hms/platform';
import { assertCancellable } from '../domain/service-order.js';
import { findOrder, markCancelled } from '../infrastructure/service-order.repository.js';
import { CLINICAL_CLOCK } from './context.js';
import { orderViews } from './order-views.js';

@Injectable()
export class OrderCancellationService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLINICAL_CLOCK) private readonly clock: Clock,
  ) {}

  cancel(orderId: string, request: CancelOrderRequest): Promise<ServiceOrder> {
    const scope = requestScope();
    const at = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      const order = await findOrder(tx, orderId);
      if (!order) throw new DomainError('NOT_FOUND', 'Order not found');
      assertCancellable(order, request.expectedVersion);
      // UC-ORD-02 step 2: billing refuses a paid line, which rolls the whole command back.
      await cancelUnpaidLine(
        tx,
        scope,
        { lineId: order.invoiceLineId, reason: request.reason },
        at,
      );
      const changed = await markCancelled(tx, {
        orderId,
        expectedVersion: request.expectedVersion,
        reason: request.reason,
        userId: scope.userId,
        at,
      });
      if (changed === 0) {
        throw new DomainError('STALE_RECORD', 'The order changed elsewhere; reload it', {
          currentVersion: request.expectedVersion + 1,
        });
      }
      await recordChange(tx, scope, {
        action: 'clinical.order.cancelled',
        eventType: 'OrderCancelled',
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
