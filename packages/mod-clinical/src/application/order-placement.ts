// Placing service orders for a visit (T-ORD-01, T-VIS-02; FR-ORD-001..003, FR-ORD-005, FR-ORD-007;
// FPR-09). Shared by the doctor's consultation and reception's direct orders. Each item becomes
// one order and one charge, in the caller's transaction: billing prices it from the version in
// force and adds the line to the visit's SERVICE invoice (C-008), so a paid doctor fee never makes
// an order eligible (FR-ORD-005). The order keeps the service as it is now, with its version.
import { randomUUID } from 'node:crypto';
import type { OrderItemRequest, OrderSource } from '@hms/contracts';
import type { TenantTx } from '@hms/database';
import { DomainError, fieldError } from '@hms/domain-kernel';
import { orderableServicesInForce, postCharge } from '@hms/mod-billing';
import { recordChange, type Scope } from '@hms/platform';
import { insertOrder } from '../infrastructure/service-order.repository.js';

export interface OrderTarget {
  visitId: string;
  patientId: string;
  source: OrderSource;
  /** Clinician orders only. */
  consultationId: string | null;
  requestingPractitionerId: string | null;
}

/** FR-ORD-001: reception may order only directly orderable services. */
const notDirect = (index: number) =>
  new DomainError('TEST_NOT_DIRECTLY_ORDERABLE', 'This service needs a doctor to order it', {
    fields: [{ path: `items.${index}.serviceItemId`, message: 'Needs a doctor to order it' }],
  });

/** Places the orders; returns their IDs in the order of the items. */
export async function placeOrders(
  tx: TenantTx,
  scope: Scope,
  target: OrderTarget,
  items: readonly OrderItemRequest[],
  at: Date,
): Promise<string[]> {
  const directOnly = target.source === 'RECEPTION_DIRECT';
  const ids: string[] = [];
  for (const [index, item] of items.entries()) {
    const [service] = await orderableServicesInForce(
      tx,
      { serviceItemId: item.serviceItemId, directOnly: false },
      at,
    );
    if (!service) {
      throw fieldError(`items.${index}.serviceItemId`, 'Choose an active service with a price');
    }
    if (directOnly && !service.directlyOrderable) throw notDirect(index);
    const orderId = randomUUID();
    const charge = await postCharge(
      tx,
      scope,
      {
        // FPR-09: one charge per order, identified by the order.
        source: { module: 'clinical', type: 'service_order', id: orderId, event: 'ORDERED' },
        patientId: target.patientId,
        visitId: target.visitId,
        serviceItemCode: service.code,
        practitionerId: null,
        quantity: 1,
        serviceTime: at,
      },
      at,
    );
    await insertOrder(tx, {
      id: orderId,
      tenantId: scope.tenantId,
      visitId: target.visitId,
      patientId: target.patientId,
      consultationId: target.consultationId,
      source: target.source,
      requestedBy: scope.userId,
      requestingPractitionerId: target.requestingPractitionerId,
      serviceItemId: service.serviceItemId,
      serviceItemVersion: service.version,
      serviceCode: service.code,
      serviceNameEn: service.nameEn,
      serviceNameBn: service.nameBn,
      category: service.category,
      reportHours: service.reportHours,
      priority: item.priority,
      clinicalNote: item.clinicalNote,
      chargeId: charge.chargeId,
      invoiceLineId: charge.lineId,
      at,
    });
    await recordChange(tx, scope, {
      action: 'clinical.order.placed',
      eventType: 'ServiceOrdered',
      targetType: 'service_order',
      targetId: orderId,
      details: {
        visitId: target.visitId,
        source: target.source,
        serviceCode: service.code,
        priority: item.priority,
        invoiceLineId: charge.lineId,
      },
    });
    ids.push(orderId);
  }
  return ids;
}
