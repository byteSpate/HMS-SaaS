'use client';
// Opening and closing the cashier's session (T-BIL-03; FR-BIL-026; UC-BIL-04; SP-03, SP-08).
// Opening takes an optional cash float. Closing asks for the amount counted for every method; a
// method that took nothing starts at 0. The server works out what was expected and the difference,
// and the dialog then shows the result before it closes.
import {
  PAYMENT_METHODS,
  type CashierSession,
  type CloseCashierSessionRequest,
  type PaymentMethod,
} from '@hms/contracts';
import { Alert, Button, Dialog, Field, TextInput, useToast } from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CASHIER_SESSION_QUERY_KEY, cashierSessionsApi } from '../../api/cashier-sessions';
import { ApiError, wasRefused } from '../../api/errors';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { amountOf } from '../../money';
import { METHOD_LABEL_KEYS, SessionTotals } from './session-totals';

/** A new key after a refusal, which saved nothing; after a timeout the same key replays. */
export function useIdempotencyKey(): [string, (error: unknown) => void] {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const renew = (error: unknown) => {
    if (wasRefused(error)) setKey(crypto.randomUUID());
  };
  return [key, renew];
}

export function OpenSessionDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [float, setFloat] = useState('');
  const [key, renewKey] = useIdempotencyKey();
  const openingFloat = float.trim() === '' ? '0.00' : amountOf(float);

  const open = useMutation({
    mutationFn: () => {
      if (!openingFloat) throw new Error('The float is not an amount');
      return cashierSessionsApi.open({ openingFloat }, key);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CASHIER_SESSION_QUERY_KEY });
      toast.show({ title: t('cashier.opened'), tone: 'success' });
      onOpenChange(false);
    },
    onError: renewKey,
  });

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={t('cashier.openTitle')}
      footer={
        <Button loading={open.isPending} disabled={!openingFloat} onClick={() => open.mutate()}>
          {t('cashier.openSubmit')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {open.error ? <Alert tone="danger">{errorMessage(open.error)}</Alert> : null}
        <Field
          label={t('cashier.openingFloat')}
          hint={t('cashier.openingFloatHint')}
          error={openingFloat === null ? t('cashier.amountInvalid') : undefined}
        >
          {({ id, ...aria }) => (
            <TextInput
              id={id}
              inputMode="decimal"
              value={float}
              onChange={(event) => setFloat(event.target.value)}
              {...aria}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

type Counted = Record<PaymentMethod, string>;

/** Methods with nothing expected start at 0, so the cashier types only what they counted. */
const countedFormOf = (session: CashierSession): Counted =>
  Object.fromEntries(
    PAYMENT_METHODS.map((method) => {
      const row = session.totals.find((total) => total.method === method);
      return [method, row && row.expected !== '0.00' ? '' : '0'];
    }),
  ) as Counted;

function countedRequestOf(form: Counted): CloseCashierSessionRequest['counted'] | null {
  const amounts = PAYMENT_METHODS.map((method) => [method, amountOf(form[method])] as const);
  if (amounts.some(([, amount]) => amount === null)) return null;
  return Object.fromEntries(amounts) as CloseCashierSessionRequest['counted'];
}

export function CloseSessionDialog({
  session,
  onOpenChange,
}: {
  session: CashierSession;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => countedFormOf(session));
  const [key, renewKey] = useIdempotencyKey();
  const counted = countedRequestOf(form);
  const refresh = () => queryClient.invalidateQueries({ queryKey: CASHIER_SESSION_QUERY_KEY });

  const close = useMutation({
    mutationFn: () => {
      if (!counted) throw new Error('The counted amounts are not complete');
      return cashierSessionsApi.close(
        session.sessionId,
        { expectedVersion: session.version, counted },
        key,
      );
    },
    onError: renewKey,
  });
  const stale = close.error instanceof ApiError && close.error.code === 'STALE_RECORD';
  const result = close.data;
  // The desk reloads only when the result is dismissed: reloading at once would find no open
  // session and take this dialog, with its result, off the screen.
  const dismissResult = (open: boolean) => {
    if (!open) void refresh();
    onOpenChange(open);
  };

  if (result) {
    return (
      <Dialog
        open
        onOpenChange={dismissResult}
        closeLabel={t('common.close')}
        title={t('cashier.closedTitle')}
        description={t('cashier.closedNotice')}
        footer={<Button onClick={() => dismissResult(false)}>{t('common.close')}</Button>}
      >
        <div className="flex flex-col gap-4">
          <Alert tone={result.hasVariance ? 'warning' : 'success'}>
            {result.hasVariance ? t('cashier.unbalanced') : t('cashier.balanced')}
          </Alert>
          <SessionTotals totals={result.totals} />
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={t('cashier.closeTitle')}
      description={t('cashier.closeHint')}
      footer={
        <Button
          loading={close.isPending}
          disabled={!counted || stale}
          onClick={() => close.mutate()}
        >
          {t('cashier.closeSubmit')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {stale ? (
          <div className="flex flex-col items-start gap-2">
            <Alert tone="warning">{t('cashier.staleNotice')}</Alert>
            <Button
              variant="secondary"
              onClick={() => {
                void refresh();
                onOpenChange(false);
              }}
            >
              {t('cashier.reload')}
            </Button>
          </div>
        ) : null}
        {close.error && !stale ? <Alert tone="danger">{errorMessage(close.error)}</Alert> : null}
        {PAYMENT_METHODS.map((method) => (
          <Field
            key={method}
            label={`${t(METHOD_LABEL_KEYS[method])} - ${t('cashier.columnCounted')}`}
            error={
              form[method].trim() !== '' && amountOf(form[method]) === null
                ? t('cashier.amountInvalid')
                : undefined
            }
          >
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                inputMode="decimal"
                value={form[method]}
                onChange={(event) =>
                  setForm((current) => ({ ...current, [method]: event.target.value }))
                }
                {...aria}
              />
            )}
          </Field>
        ))}
      </div>
    </Dialog>
  );
}
