'use client';
// Taking a payment for one patient (T-BIL-04; UC-BIL-01, UC-BIL-02; SCR-06, W-02; F section 5;
// C-008, C-038, C-039, C-040). The patient's open invoices are shown as cards, the doctor fee
// apart from services. Every unpaid line starts selected for its balance; the cashier may
// deselect a line or pay part of it. One confirmation records one payment for all selected lines
// (C-039) and shows the receipt number and each invoice's new balance, with Print receipt. When the
// answer is lost, the desk asks by the payment's key whether it was saved (T-BIL-05, FR-BIL-036).
import {
  PAYMENT_METHODS,
  type Invoice,
  type InvoiceLine,
  type PatientRef,
  type Payment,
  type PaymentMethod,
} from '@hms/contracts';
import { formatMoney, type Locale } from '@hms/i18n';
import { Alert, Button, Checkbox, Field, Radio, Skeleton, StatusBadge, TextInput } from '@hms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { CASHIER_SESSION_QUERY_KEY } from '../../api/cashier-sessions';
import { INVOICES_QUERY_KEY, invoicesApi } from '../../api/invoices';
import { operationsApi } from '../../api/operations';
import { PAYMENTS_QUERY_KEY, paymentsApi } from '../../api/payments';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { sumAmounts } from '../../money';
import { displayName } from '../patients/patient-text';
import {
  allocationsOf,
  lineProblemOf,
  requestOf,
  selectionOf,
  type LineProblem,
  type MethodDetails,
  type Selection,
} from './payment-form';
import { checkOf, isUncertain } from './payment-status';
import { usePrintReceipt } from './receipts';
import { useIdempotencyKey } from './session-dialogs';
import { METHOD_LABEL_KEYS } from './session-totals';

// Full catalog keys as literals, so the unused-key check can see them.
const INVOICE_TITLE_KEYS = {
  DOCTOR_FEE: 'cashier.invoiceDoctorFee',
  SERVICE: 'cashier.invoiceService',
} as const;
const SYSTEM_ITEM_KEYS: Record<string, 'print.doctorFeeNew' | 'print.doctorFeeFollowUp'> = {
  DOCTOR_FEE_NEW: 'print.doctorFeeNew',
  DOCTOR_FEE_FOLLOW_UP: 'print.doctorFeeFollowUp',
};

function useMoney() {
  const locale = useLocale() as Locale;
  return (amount: string) => formatMoney(amount, locale, { symbol: 'sign' });
}

/** A line as the desk names it: the item in the screen's language, and the doctor of a fee. */
function useLineLabel() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  return (line: Pick<InvoiceLine, 'itemCode' | 'itemNameEn' | 'itemNameBn' | 'practitioner'>) => {
    const systemKey = SYSTEM_ITEM_KEYS[line.itemCode];
    const names =
      locale === 'en' ? [line.itemNameEn, line.itemNameBn] : [line.itemNameBn, line.itemNameEn];
    const item = systemKey ? t(systemKey) : (names.find(Boolean) ?? line.itemCode);
    const doctor = line.practitioner?.nameEn ?? line.practitioner?.nameBn;
    return doctor ? `${item} (${doctor})` : item;
  };
}

function InvoiceCard({
  invoice,
  selection,
  onChange,
}: {
  invoice: Invoice;
  selection: Selection;
  onChange: (lineId: string, patch: Partial<Selection[string]>) => void;
}) {
  const t = useTranslations();
  const money = useMoney();
  const lineLabel = useLineLabel();
  const problemText = (problem: LineProblem | null, balance: string) => {
    if (problem === 'overBalance') return t('cashier.overBalance', { amount: money(balance) });
    if (problem === 'notAmount') return t('cashier.amountInvalid');
    return undefined;
  };

  return (
    <section
      aria-label={`${t(INVOICE_TITLE_KEYS[invoice.type])} ${invoice.number}`}
      className="flex flex-col gap-3 rounded-panel border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {t(INVOICE_TITLE_KEYS[invoice.type])} - {invoice.number}
        </h3>
        <p className="text-sm tabular-nums">
          {t('cashier.invoiceBalance', { amount: money(invoice.balance) })}
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {invoice.lines.map((line) => {
          const entry = selection[line.lineId];
          const label = lineLabel(line);
          if (!entry) {
            return (
              <li key={line.lineId} className="flex items-center justify-between gap-3 text-sm">
                <span>{label}</span>
                <StatusBadge size="sm" status="done" label={t('cashier.ready')} />
              </li>
            );
          }
          const problem = lineProblemOf(entry, line.balance);
          return (
            <li key={line.lineId} className="flex flex-wrap items-start justify-between gap-3">
              <Checkbox
                label={`${label} - ${t('cashier.due', { amount: money(line.balance) })}`}
                checked={entry.selected}
                onChange={(event) => onChange(line.lineId, { selected: event.target.checked })}
              />
              {entry.selected ? (
                <Field
                  label={t('cashier.lineAmount', { item: label })}
                  error={problemText(problem, line.balance)}
                >
                  {({ id, ...aria }) => (
                    <TextInput
                      id={id}
                      inputMode="decimal"
                      className="w-36 text-end"
                      value={entry.amountText}
                      onChange={(event) =>
                        onChange(line.lineId, { amountText: event.target.value })
                      }
                      {...aria}
                    />
                  )}
                </Field>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PaymentOutcome({ payment, onNext }: { payment: Payment; onNext: () => void }) {
  const t = useTranslations();
  const money = useMoney();
  const errorMessage = useApiErrorMessage();
  const print = usePrintReceipt();

  return (
    <section
      aria-labelledby="payment-outcome-title"
      className="flex flex-col gap-3 rounded-panel border border-border bg-surface p-4"
    >
      <h3 id="payment-outcome-title" className="text-base font-semibold">
        {t('cashier.savedTitle')}
      </h3>
      <Alert tone="success">
        {t('cashier.savedLine', {
          receipt: payment.receiptNumber,
          amount: money(payment.amount),
        })}
      </Alert>
      <ul className="flex flex-col gap-1 text-sm">
        {payment.invoices.map((invoice) => (
          <li key={invoice.invoiceId}>
            {t('cashier.balanceAfter', {
              invoice: `${t(INVOICE_TITLE_KEYS[invoice.type])} ${invoice.number}`,
              amount: money(invoice.balanceAfter),
            })}
          </li>
        ))}
      </ul>
      {print.error ? <Alert tone="danger">{errorMessage(print.error)}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button loading={print.isPending} onClick={() => print.mutate(payment.paymentId)}>
          {t('cashier.printReceipt')}
        </Button>
        <Button variant="secondary" onClick={onNext}>
          {t('cashier.nextPatient')}
        </Button>
      </div>
    </section>
  );
}

/**
 * T-BIL-05 (FR-BIL-036, SP-08): the answer to a payment was lost. The desk asks by its key: saved
 * shows the outcome; not saved offers Try again with the same key, which the server replays if
 * the first request did commit after all; a failed check offers Check again. Never Pay again.
 */
function PaymentCheck({
  idempotencyKey,
  attempt,
  retrying,
  onSaved,
  onRetry,
}: {
  idempotencyKey: string;
  /** When the payment was last sent, so each attempt is checked afresh. */
  attempt: number;
  retrying: boolean;
  onSaved: (payment: Payment) => void;
  onRetry: () => void;
}) {
  const t = useTranslations();
  const check = useQuery({
    queryKey: ['operations', idempotencyKey, attempt],
    queryFn: () => operationsApi.outcome(idempotencyKey),
    retry: false,
  });
  const state = checkOf(check.data, check.error);
  const savedPayment = state.kind === 'saved' ? state.payment : null;
  // Reported once: the parent then shows the outcome instead of this form.
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (!savedPayment || reported.current === savedPayment.paymentId) return;
    reported.current = savedPayment.paymentId;
    onSaved(savedPayment);
  }, [savedPayment, onSaved]);

  if (state.kind === 'checking' || state.kind === 'saved') {
    return <Alert tone="info">{t('cashier.checking')}</Alert>;
  }
  if (state.kind === 'notSaved') {
    return (
      <div className="flex flex-col items-start gap-2">
        <Alert tone="warning">{t('cashier.notSaved')}</Alert>
        <Button loading={retrying} onClick={onRetry}>
          {t('cashier.tryAgain')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <Alert tone="danger">{t('cashier.checkFailed')}</Alert>
      <Button variant="secondary" loading={check.isFetching} onClick={() => void check.refetch()}>
        {t('cashier.checkAgain')}
      </Button>
    </div>
  );
}

function PaymentForm({
  patient,
  invoices,
  onSaved,
}: {
  patient: PatientRef;
  invoices: Invoice[];
  onSaved: (payment: Payment) => void;
}) {
  const t = useTranslations();
  const money = useMoney();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState(() => selectionOf(invoices));
  const [details, setDetails] = useState<MethodDetails>({
    method: 'CASH',
    providerLabel: '',
    externalReference: '',
  });
  const [key, renewKey] = useIdempotencyKey();
  const allocations = allocationsOf(invoices, selection);
  const total = sumAmounts(allocations?.map((allocation) => allocation.amount) ?? []);
  const change = (lineId: string, patch: Partial<Selection[string]>) =>
    setSelection((current) => {
      const entry = current[lineId];
      return entry ? { ...current, [lineId]: { ...entry, ...patch } } : current;
    });

  const finish = async (payment: Payment) => {
    onSaved(payment);
    await Promise.all(
      [INVOICES_QUERY_KEY, CASHIER_SESSION_QUERY_KEY, PAYMENTS_QUERY_KEY].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };

  const pay = useMutation({
    mutationFn: () => {
      if (!allocations) throw new Error('Nothing to pay');
      return paymentsApi.record(requestOf(patient.patientId, allocations, details), key);
    },
    onSuccess: finish,
    // A refusal gets a new key; a lost answer keeps it, so a retry cannot pay twice (SP-08).
    onError: renewKey,
  });
  const uncertain = isUncertain(pay.error);

  return (
    <div className="flex flex-col gap-4">
      {invoices.map((invoice) => (
        <InvoiceCard
          key={invoice.invoiceId}
          invoice={invoice}
          selection={selection}
          onChange={change}
        />
      ))}
      <section
        aria-labelledby="take-payment-title"
        className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-4"
      >
        <h3 id="take-payment-title" className="text-base font-semibold">
          {t('cashier.payTitle')}
        </h3>
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-2 text-sm font-medium">{t('cashier.method')}</legend>
          {PAYMENT_METHODS.map((method: PaymentMethod) => (
            <Radio
              key={method}
              name="payment-method"
              label={t(METHOD_LABEL_KEYS[method])}
              checked={details.method === method}
              onChange={() => setDetails((current) => ({ ...current, method }))}
            />
          ))}
        </fieldset>
        {details.method !== 'CASH' ? (
          <div className="flex flex-wrap gap-4">
            <Field label={t('cashier.provider')} hint={t('cashier.providerHint')}>
              {({ id, ...aria }) => (
                <TextInput
                  id={id}
                  maxLength={60}
                  value={details.providerLabel}
                  onChange={(event) =>
                    setDetails((current) => ({ ...current, providerLabel: event.target.value }))
                  }
                  {...aria}
                />
              )}
            </Field>
            <Field label={t('cashier.reference')} hint={t('cashier.referenceHint')}>
              {({ id, ...aria }) => (
                <TextInput
                  id={id}
                  maxLength={100}
                  value={details.externalReference}
                  onChange={(event) =>
                    setDetails((current) => ({
                      ...current,
                      externalReference: event.target.value,
                    }))
                  }
                  {...aria}
                />
              )}
            </Field>
          </div>
        ) : null}
        <p className="text-base font-semibold tabular-nums">
          {t('cashier.amountToPay', { amount: money(total) })}
        </p>
        {allocations ? null : (
          <p className="text-sm text-text-muted">{t('cashier.nothingSelected')}</p>
        )}
        {pay.error && !uncertain ? <Alert tone="danger">{errorMessage(pay.error)}</Alert> : null}
        {uncertain ? (
          // FR-BIL-036: no "Pay again" while it is not known whether the payment was saved.
          <PaymentCheck
            idempotencyKey={key}
            attempt={pay.submittedAt}
            retrying={pay.isPending}
            onSaved={(payment) => void finish(payment)}
            onRetry={() => pay.mutate()}
          />
        ) : (
          <div>
            <Button loading={pay.isPending} disabled={!allocations} onClick={() => pay.mutate()}>
              {t('cashier.confirm')}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

export function PaymentDesk({ patient, onNext }: { patient: PatientRef; onNext: () => void }) {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const [saved, setSaved] = useState<Payment | null>(null);
  const invoices = useQuery({
    queryKey: [...INVOICES_QUERY_KEY, 'patient', patient.patientId],
    queryFn: () => invoicesApi.openOfPatient(patient.patientId),
    enabled: saved === null,
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-panel border border-border bg-surface-hover px-4 py-2 text-sm">
        <span className="font-semibold">{displayName(patient)}</span> - {patient.mrn}
      </p>
      {saved ? <PaymentOutcome payment={saved} onNext={onNext} /> : null}
      {saved ? null : (
        <>
          {invoices.error ? <Alert tone="danger">{errorMessage(invoices.error)}</Alert> : null}
          {invoices.isPending ? <Skeleton className="h-40" /> : null}
          {invoices.data?.length === 0 ? (
            <p className="text-sm text-text-muted">{t('cashier.noOpenInvoices')}</p>
          ) : null}
          {invoices.data && invoices.data.length > 0 ? (
            <PaymentForm
              key={invoices.data.map((invoice) => `${invoice.invoiceId}:${invoice.version}`).join()}
              patient={patient}
              invoices={invoices.data}
              onSaved={setSaved}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
