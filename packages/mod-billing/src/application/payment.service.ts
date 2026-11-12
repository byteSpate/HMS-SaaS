// Recording payments and printing receipts (T-BIL-04; UC-BIL-01, UC-BIL-02; FR-BIL-002,
// FR-BIL-004, FR-BIL-011, FR-BIL-012, FR-BIL-019, FR-BIL-027, FR-BIL-034; C-009, C-038, C-039,
// C-040; FR-AUD-001). A cashier (billing.payment.record) records a payment in their open session,
// allocated to lines of one patient's open invoices. One transaction (E section 9.1): the session
// share-locked, the invoices locked in ID order, the lines checked, then the payment, its
// allocations, the line and invoice amounts, the receipt number, the audit and the outbox event.
// The Idempotency-Key makes a retry return the same payment (FPR-08). A print records its copy
// number and returns the receipt page; it never creates a payment.
import { Inject, Injectable } from '@nestjs/common';
import type {
  Payment,
  PaymentList,
  PrintReceiptRequest,
  ReceiptPrint,
  RecordPaymentRequest,
} from '@hms/contracts';
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import { DomainError, Money, type Clock } from '@hms/domain-kernel';
import { findStaffNames, hospitalFacilityId, hospitalNamesOf } from '@hms/mod-identity-access';
import { findPatientRefs, findPractitionerChoices } from '@hms/mod-patients';
import { allocateBusinessNumber, PRISMA, recordChange, requestScope } from '@hms/platform';
import { renderReceiptHtml } from '@hms/print-templates';
import { planPayment } from '../domain/payment.js';
import {
  findPayment,
  invoiceIdsOfLines,
  listSessionPayments,
  lockInvoices,
  lockOpenSession,
  readPaymentTargets,
  recordReceiptPrint,
  writePayment,
  type StoredPayment,
} from '../infrastructure/payment.repository.js';
import { BILLING_CLOCK } from './context.js';
import { receiptDataOf } from './receipt.js';

// C-033 style: {PREFIX}-{seq:6}; receipt patterns are still open (Q-034), so the prefix is fixed.
const RECEIPT_PATTERN = '{PREFIX}-{seq:6}';
const RECEIPT_PREFIX = 'RCPT';

const notFound = () => new DomainError('NOT_FOUND', 'Payment not found');

async function toPayments(tx: TenantTx, stored: StoredPayment[]): Promise<Payment[]> {
  const patients = await findPatientRefs(
    tx,
    stored.map((payment) => payment.patientId),
  );
  const names = await findStaffNames(
    tx,
    stored.map((payment) => payment.receivedBy),
  );
  const practitioners = await findPractitionerChoices(
    tx,
    stored.flatMap((payment) =>
      payment.invoices.flatMap((invoice) =>
        invoice.lines.flatMap((line) => (line.practitionerId ? [line.practitionerId] : [])),
      ),
    ),
  );
  return stored.map((payment) => {
    const patient = patients.get(payment.patientId);
    if (!patient) throw notFound();
    return {
      paymentId: payment.paymentId,
      receiptNumber: payment.receiptNumber,
      patient,
      sessionId: payment.sessionId,
      method: payment.method as Payment['method'],
      providerLabel: payment.providerLabel,
      externalReference: payment.externalReference,
      amount: payment.amount.toDecimalString(),
      receivedAt: payment.receivedAt.toISOString(),
      cashier: { userId: payment.receivedBy, displayName: names.get(payment.receivedBy) ?? '' },
      invoices: payment.invoices.map((invoice) => ({
        invoiceId: invoice.invoiceId,
        number: invoice.number,
        type: invoice.type,
        paid: invoice.paid.toDecimalString(),
        balanceAfter: invoice.balanceAfter.toDecimalString(),
        lines: invoice.lines.map((line) => ({
          lineId: line.lineId,
          itemCode: line.itemCode,
          itemNameEn: line.itemNameEn,
          itemNameBn: line.itemNameBn,
          practitioner: line.practitionerId
            ? (practitioners.get(line.practitionerId) ?? null)
            : null,
          amount: line.amount.toDecimalString(),
        })),
      })),
      printCount: payment.printCount,
    };
  });
}

async function readPayment(tx: TenantTx, paymentId: string): Promise<Payment> {
  const stored = await findPayment(tx, paymentId);
  if (!stored) throw notFound();
  const [payment] = await toPayments(tx, [stored]);
  if (!payment) throw notFound();
  return payment;
}

@Injectable()
export class PaymentService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(BILLING_CLOCK) private readonly clock: Clock,
  ) {}

  record(request: RecordPaymentRequest): Promise<Payment> {
    const scope = requestScope();
    const now = this.clock.now();
    const amount = Money.parse(request.amount);
    return withTenant(this.prisma, scope, async (tx) => {
      // FR-BIL-026, UC-BIL-01 D2: every payment is in the cashier's open session.
      const sessionId = await lockOpenSession(
        tx,
        await hospitalFacilityId(tx, scope.tenantId),
        scope.userId,
      );
      if (!sessionId) {
        throw new DomainError('INVALID_TRANSITION', 'Open your cashier session first', {
          reason: 'CASHIER_SESSION_NOT_OPEN',
        });
      }
      const lineIds = request.allocations.map((allocation) => allocation.lineId);
      const invoiceIds = await invoiceIdsOfLines(tx, lineIds);
      await lockInvoices(tx, invoiceIds);
      const targets = await readPaymentTargets(tx, lineIds, invoiceIds);
      const plan = planPayment(
        {
          patientId: request.patientId,
          amount,
          allocations: request.allocations.map((allocation) => ({
            lineId: allocation.lineId,
            amount: Money.parse(allocation.amount),
          })),
        },
        targets.lines,
        targets.invoices,
      );
      const receiptNumber = await allocateBusinessNumber(tx, {
        tenantId: scope.tenantId,
        sequenceKey: 'RECEIPT',
        pattern: RECEIPT_PATTERN,
        prefix: RECEIPT_PREFIX,
      });
      const paymentId = await writePayment(tx, {
        tenantId: scope.tenantId,
        receiptNumber,
        patientId: request.patientId,
        sessionId,
        method: request.method,
        providerLabel: request.providerLabel ?? null,
        externalReference: request.externalReference ?? null,
        amount,
        userId: scope.userId,
        at: now,
        plan,
      });
      await recordChange(tx, scope, {
        action: 'billing.payment.recorded',
        eventType: 'PaymentRecorded',
        targetType: 'payment',
        targetId: paymentId,
        details: {
          receiptNumber,
          amount: amount.toDecimalString(),
          method: request.method,
          sessionId,
          invoiceCount: plan.invoices.length,
          lineCount: plan.lines.length,
        },
      });
      return readPayment(tx, paymentId);
    });
  }

  get(paymentId: string): Promise<Payment> {
    const scope = requestScope();
    return withTenant(this.prisma, scope, (tx) => readPayment(tx, paymentId));
  }

  list(sessionId: string): Promise<PaymentList> {
    const scope = requestScope();
    return withTenant(this.prisma, scope, async (tx) => ({
      payments: await toPayments(tx, await listSessionPayments(tx, sessionId)),
    }));
  }

  /** FR-BIL-027: the receipt page; copy 2 and later are marked and every print is audited. */
  print(paymentId: string, request: PrintReceiptRequest): Promise<ReceiptPrint> {
    const scope = requestScope();
    const now = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      const payment = await readPayment(tx, paymentId);
      const copyNo = await recordReceiptPrint(tx, {
        tenantId: scope.tenantId,
        paymentId,
        language: request.language,
        userId: scope.userId,
        at: now,
      });
      await recordChange(tx, scope, {
        action: 'billing.receipt.printed',
        eventType: 'ReceiptPrinted',
        targetType: 'payment',
        targetId: paymentId,
        details: { receiptNumber: payment.receiptNumber, copyNo, language: request.language },
      });
      const hospital = await hospitalNamesOf(tx, scope.tenantId);
      const html = renderReceiptHtml(
        receiptDataOf(payment, hospital, copyNo, now),
        request.language,
      );
      return { copyNo, html };
    });
  }
}
