// The charge interface other modules call (T-BIL-02; FR-BIL-006, FR-BIL-007, FR-BIL-009,
// FR-BIL-033; C-008; FPR-09). postCharge runs inside the caller's transaction, so the charge
// commits or rolls back with the caller's own change (a check-in, an order). Billing chooses the
// price (the version in force at the service time; a client price does not exist here) and the
// invoice (the visit's DOCTOR_FEE or SERVICE invoice, created on first use).
import { Logger } from '@nestjs/common';
import type { TenantTx } from '@hms/database';
import { DomainError } from '@hms/domain-kernel';
import { allocateBusinessNumber, recordChange, type Scope } from '@hms/platform';
import {
  deriveInvoiceStatus,
  invoiceTypeFor,
  lineCategoryFor,
  sameCharge,
} from '../domain/invoice.js';
import {
  appendLine,
  createVisitInvoice,
  findChargeBySource,
  findServiceItem,
  findUnitPrice,
  findVisitInvoiceId,
  insertCharge,
  invoiceAmounts,
  setInvoiceStatus,
  type SourceReference,
} from '../infrastructure/invoice.repository.js';
import { findVersionInForce } from '../infrastructure/price-list.repository.js';

export type { SourceReference };

export interface PostChargeRequest {
  /** FPR-09: the posting's identity, e.g. ('clinical', 'visit', visitId, 'CHECKED_IN'). */
  source: SourceReference;
  patientId: string;
  visitId: string;
  /** The catalogue item; for now the doctor-fee system items (T-BIL-01). */
  serviceItemCode: string;
  /** The doctor whose price applies, for doctor fees. */
  practitionerId: string | null;
  /** Whole quantities only until a rounding policy exists (Q-020). */
  quantity: number;
  /** FR-BIL-007: the price list version in force at this time prices the charge. */
  serviceTime: Date;
}

export interface PostedCharge {
  chargeId: string;
  invoiceId: string;
  lineId: string;
  /** True when the source reference was already posted and the first charge is returned. */
  replayed: boolean;
}

// C-033 style: {PREFIX}-{seq:6}, one continuous sequence for both invoice types. Patterns of
// other documents are still open (Q-034), so the prefix is fixed until a policy exists.
const INVOICE_PATTERN = '{PREFIX}-{seq:6}';
const INVOICE_PREFIX = 'INV';
const logger = new Logger('Billing');

const notConfigured = (request: PostChargeRequest) =>
  new DomainError('POLICY_NOT_CONFIGURED', 'No price is set for this item', {
    serviceItemCode: request.serviceItemCode,
    ...(request.practitionerId ? { practitionerId: request.practitionerId } : {}),
  });

async function invoiceFor(
  tx: TenantTx,
  scope: Scope,
  request: PostChargeRequest,
  itemCategory: string,
  at: Date,
): Promise<string> {
  const type = invoiceTypeFor(itemCategory);
  const existing = await findVisitInvoiceId(tx, request.visitId, type);
  if (existing) return existing;
  const number = await allocateBusinessNumber(tx, {
    tenantId: scope.tenantId,
    sequenceKey: 'INVOICE',
    pattern: INVOICE_PATTERN,
    prefix: INVOICE_PREFIX,
  });
  return createVisitInvoice(tx, {
    tenantId: scope.tenantId,
    type,
    number,
    patientId: request.patientId,
    visitId: request.visitId,
    userId: scope.userId,
    at,
  });
}

/**
 * Posts one charge and its invoice line, or returns the charge already posted under the same
 * source reference (AT-BIL-009). The same reference with different content is a defect in the
 * caller: it is refused with IDEMPOTENCY_KEY_REUSED and logged as an alert (AT-BIL-010).
 * POLICY_NOT_CONFIGURED when the item has no price in force (FR-BIL-010 A1 for doctor fees).
 */
export async function postCharge(
  tx: TenantTx,
  scope: Scope,
  request: PostChargeRequest,
  at: Date,
): Promise<PostedCharge> {
  const item = await findServiceItem(tx, request.serviceItemCode);
  if (!item) throw notConfigured(request);
  const content = {
    patientId: request.patientId,
    visitId: request.visitId,
    serviceItemId: item.id,
    practitionerId: request.practitionerId,
    quantity: request.quantity,
  };
  const posted = await findChargeBySource(tx, request.source);
  if (posted) {
    if (!sameCharge(posted, content)) {
      logger.warn({ msg: 'charge source reference reused', source: request.source });
      throw new DomainError(
        'IDEMPOTENCY_KEY_REUSED',
        'This source reference was already posted with other content',
      );
    }
    return {
      chargeId: posted.chargeId,
      invoiceId: posted.invoiceId,
      lineId: posted.lineId,
      replayed: true,
    };
  }

  const version = await findVersionInForce(tx, request.serviceTime);
  const unitPrice = version
    ? await findUnitPrice(tx, {
        versionId: version.id,
        serviceItemId: item.id,
        practitionerId: request.practitionerId,
      })
    : null;
  if (!version || !unitPrice) throw notConfigured(request);

  const amount = unitPrice.times(request.quantity);
  const invoiceId = await invoiceFor(tx, scope, request, item.category, at);
  const chargeId = await insertCharge(tx, {
    ...content,
    tenantId: scope.tenantId,
    source: request.source,
    unitPrice,
    amount,
    priceListVersionId: version.id,
    serviceTime: request.serviceTime,
    userId: scope.userId,
    at,
  });
  const lineId = await appendLine(tx, {
    tenantId: scope.tenantId,
    invoiceId,
    chargeId,
    category: lineCategoryFor(item.category),
    amount,
    at,
  });
  await setInvoiceStatus(tx, invoiceId, deriveInvoiceStatus(await invoiceAmounts(tx, invoiceId)));
  await recordChange(tx, scope, {
    action: 'billing.charge.posted',
    eventType: 'ChargePosted',
    targetType: 'charge',
    targetId: chargeId,
    details: {
      invoiceId,
      lineId,
      serviceItemCode: request.serviceItemCode,
      amount: amount.toDecimalString(),
      priceListVersionId: version.id,
      sourceModule: request.source.module,
      sourceType: request.source.type,
      sourceId: request.source.id,
      sourceEvent: request.source.event,
    },
  });
  return { chargeId, invoiceId, lineId, replayed: false };
}
