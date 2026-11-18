'use client';
// Order entry (T-ORD-01; FR-ORD-002, FR-ORD-008): services picked one after another collect in a
// list with their priority and an optional note; "Place orders" sends them in one request with an
// Idempotency-Key kept until it succeeds or is refused (SP-08). Used by the doctor's consultation
// and by reception's direct orders.
import { ORDER_PRIORITIES, type OrderPriority, type PlaceOrdersRequest } from '@hms/contracts';
import { formatMoney, type Locale } from '@hms/i18n';
import { Alert, Button, IconButton, Select, TextInput } from '@hms/ui';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { wasRefused } from '../../api/errors';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { serviceName } from '../services/service-form';
import { PRIORITY_KEYS } from './order-labels';
import { addPending, requestOf, type PendingOrder } from './order-rules';
import { ServicePicker } from './service-picker';

export function OrderEntry({
  direct,
  place,
  onPlaced,
}: {
  direct: boolean;
  place: (body: PlaceOrdersRequest, key: string) => Promise<unknown>;
  onPlaced: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const errorMessage = useApiErrorMessage();
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const submit = useMutation({
    mutationFn: () => place(requestOf(pending), key),
    onSuccess: () => {
      setPending([]);
      setKey(crypto.randomUUID());
      onPlaced();
    },
    onError: (error) => {
      if (wasRefused(error)) setKey(crypto.randomUUID());
    },
  });
  const change = (serviceItemId: string, patch: Partial<PendingOrder>) =>
    setPending((list) =>
      list.map((row) => (row.service.serviceItemId === serviceItemId ? { ...row, ...patch } : row)),
    );

  return (
    <div className="flex flex-col gap-3">
      <ServicePicker
        direct={direct}
        onPick={(service) => setPending((list) => addPending(list, service))}
      />
      {submit.error ? <Alert tone="danger">{errorMessage(submit.error)}</Alert> : null}
      {pending.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label={t('orders.pendingLabel')}>
          {pending.map((row) => {
            const name = serviceName(row.service, locale);
            return (
              <li
                key={row.service.serviceItemId}
                className="grid items-center gap-2 rounded-panel border border-border p-2 sm:grid-cols-[1fr_9rem_1fr_auto]"
              >
                <span>
                  <span className="font-medium">{name}</span>
                  <span className="ms-2 text-sm text-text-muted">
                    {formatMoney(row.service.unitPrice, locale, { symbol: 'sign' })}
                  </span>
                </span>
                <Select
                  aria-label={`${t('orders.priority')}: ${name}`}
                  value={row.priority}
                  options={ORDER_PRIORITIES.map((priority) => ({
                    value: priority,
                    label: t(PRIORITY_KEYS[priority]),
                  }))}
                  onChange={(event) =>
                    change(row.service.serviceItemId, {
                      priority: event.target.value as OrderPriority,
                    })
                  }
                />
                <TextInput
                  aria-label={`${t('orders.note')}: ${name}`}
                  placeholder={t('orders.notePlaceholder')}
                  maxLength={500}
                  value={row.note}
                  onChange={(event) =>
                    change(row.service.serviceItemId, { note: event.target.value })
                  }
                />
                <IconButton
                  icon="trash"
                  variant="secondary"
                  label={`${t('orders.removePending')}: ${name}`}
                  onClick={() =>
                    setPending((list) =>
                      list.filter(
                        (item) => item.service.serviceItemId !== row.service.serviceItemId,
                      ),
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      ) : null}
      <div>
        <Button
          loading={submit.isPending}
          disabled={pending.length === 0}
          onClick={() => submit.mutate()}
        >
          {t('orders.place', { count: pending.length })}
        </Button>
      </div>
    </div>
  );
}
