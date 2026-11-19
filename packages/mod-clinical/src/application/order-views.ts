// An order as the screens show it (T-ORD-01; FR-ORD-004): its own fulfilment state beside the
// payment state of its invoice line, read from billing, and the requester's name.
import type { ServiceOrder } from '@hms/contracts';
import type { TenantTx } from '@hms/database';
import { findLineStates } from '@hms/mod-billing';
import { findStaffNames } from '@hms/mod-identity-access';
import type { StoredOrder } from '../infrastructure/service-order.repository.js';

export async function orderViews(
  tx: TenantTx,
  orders: readonly StoredOrder[],
): Promise<ServiceOrder[]> {
  const [lines, names] = await Promise.all([
    findLineStates(
      tx,
      orders.map((order) => order.invoiceLineId),
    ),
    findStaffNames(
      tx,
      orders.map((order) => order.requestedBy),
    ),
  ]);
  return orders.flatMap((order): ServiceOrder[] => {
    const line = lines.get(order.invoiceLineId);
    if (!line) return [];
    return [
      {
        orderId: order.orderId,
        visitId: order.visitId,
        source: order.source,
        service: order.service,
        reportHours: order.reportHours,
        priority: order.priority,
        clinicalNote: order.clinicalNote,
        status: order.status,
        payment: {
          amount: line.amount.toDecimalString(),
          paid: line.paid.toDecimalString(),
          due: line.due.toDecimalString(),
          eligibility: line.eligibility,
          lineStatus: line.status,
        },
        requestedAt: order.createdAt.toISOString(),
        requestedBy: names.get(order.requestedBy) ?? '',
        cancelReason: order.cancelReason,
        version: order.version,
      },
    ];
  });
}
