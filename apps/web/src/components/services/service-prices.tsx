'use client';
// Service prices on the price list screen (T-ORD-01; FR-CFG-002, FR-BIL-007; C-041): one price per
// orderable service. In the draft a price is added, changed or removed; the version in force is
// read-only. Amounts are formatted from their strings (ADR-007).
import type { PriceList, ServicePrice } from '@hms/contracts';
import { formatMoney, type Locale } from '@hms/i18n';
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Select,
  TextInput,
  useToast,
} from '@hms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { wasRefused } from '../../api/errors';
import { PRICE_LISTS_QUERY_KEY, priceListsApi } from '../../api/price-lists';
import { SERVICES_QUERY_KEY, servicesApi } from '../../api/services';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { CELL, HEAD_CELL, ROW, ROW_TITLE, TABLE, TABLE_FRAME } from '../admin/admin-table';
import { serviceName } from './service-form';

/** The same rule as the contract: two decimals, more than zero (C-041). */
export function isPrice(text: string): boolean {
  return /^\d{1,16}\.\d{2}$/.test(text.trim()) && !/^0+\.00$/.test(text.trim());
}

interface RowActions {
  onEdit: (price: ServicePrice) => void;
  onRemove: (price: ServicePrice) => void;
  removingId?: string;
}

export function ServicePriceTable({
  prices,
  actions,
}: {
  prices: ServicePrice[];
  actions?: RowActions;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  return (
    <div className={TABLE_FRAME}>
      <table className={TABLE}>
        <thead>
          <tr>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('servicePrices.columnService')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-end`}>
              {t('servicePrices.columnPrice')}
            </th>
            {actions ? (
              <th scope="col" className={`${HEAD_CELL} text-end`}>
                {t('servicePrices.columnActions')}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {prices.map((price) => {
            const name = serviceName(price.service, locale);
            return (
              <tr key={price.service.serviceItemId} className={ROW}>
                <td className={CELL}>
                  <p className={ROW_TITLE}>{name}</p>
                  <p className="font-mono text-[0.6875rem] text-text-muted">{price.service.code}</p>
                </td>
                <td
                  className={`${CELL} text-end tabular-nums`}
                  data-label={t('servicePrices.columnPrice')}
                >
                  {formatMoney(price.unitPrice, locale, { symbol: 'sign' })}
                </td>
                {actions ? (
                  <td className={`${CELL} text-end`} data-cell="actions">
                    <span className="inline-flex gap-1">
                      <IconButton
                        icon="pencil"
                        label={`${t('servicePrices.edit')}: ${name}`}
                        variant="secondary"
                        onClick={() => actions.onEdit(price)}
                      />
                      <IconButton
                        icon="trash"
                        label={`${t('servicePrices.remove')}: ${name}`}
                        variant="secondary"
                        disabled={actions.removingId === price.service.serviceItemId}
                        onClick={() => actions.onRemove(price)}
                      />
                    </span>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ServicePriceDialog({
  draft,
  price,
  onOpenChange,
}: {
  draft: PriceList;
  /** Absent when adding a price. */
  price?: ServicePrice;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [serviceItemId, setServiceItemId] = useState(price?.service.serviceItemId ?? '');
  const [amount, setAmount] = useState(price?.unitPrice ?? '');
  const [key] = useState(() => crypto.randomUUID());
  const services = useQuery({ queryKey: SERVICES_QUERY_KEY, queryFn: servicesApi.list });
  const priced = new Set(draft.servicePrices.map((row) => row.service.serviceItemId));
  const choices = (services.data ?? []).filter(
    (service) => service.active && !priced.has(service.serviceItemId),
  );
  const save = useMutation({
    mutationFn: () =>
      priceListsApi.setServicePrice(
        draft.priceListId,
        serviceItemId,
        { unitPrice: amount.trim(), expectedVersion: draft.version },
        key,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PRICE_LISTS_QUERY_KEY });
      toast.show({ title: t('servicePrices.saved'), tone: 'success' });
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={price ? t('servicePrices.editTitle') : t('servicePrices.addTitle')}
      description={t('servicePrices.formHint')}
      footer={
        <Button
          loading={save.isPending}
          disabled={serviceItemId === '' || !isPrice(amount)}
          onClick={() => save.mutate()}
        >
          {t('servicePrices.save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {save.error ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
        {price ? (
          <p className="font-medium">{serviceName(price.service, locale)}</p>
        ) : (
          <Field label={t('servicePrices.service')}>
            {({ id, ...aria }) => (
              <Select
                id={id}
                value={serviceItemId}
                options={[
                  { value: '', label: t('servicePrices.chooseService') },
                  ...choices.map((service) => ({
                    value: service.serviceItemId,
                    label: `${service.code} - ${serviceName(service, locale)}`,
                  })),
                ]}
                onChange={(event) => setServiceItemId(event.target.value)}
                {...aria}
              />
            )}
          </Field>
        )}
        <Field
          label={t('servicePrices.price')}
          hint={t('servicePrices.priceHint')}
          error={
            amount.trim() !== '' && !isPrice(amount) ? t('servicePrices.priceInvalid') : undefined
          }
        >
          {({ id, ...aria }) => (
            <TextInput
              id={id}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              {...aria}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

type OpenDialog = { kind: 'add' } | { kind: 'edit'; price: ServicePrice } | null;

/** The draft's service prices with add, edit and remove. */
export function DraftServicePrices({ draft }: { draft: PriceList }) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [removeKey, setRemoveKey] = useState(() => crypto.randomUUID());
  const remove = useMutation({
    mutationFn: (price: ServicePrice) =>
      priceListsApi.removeServicePrice(
        draft.priceListId,
        price.service.serviceItemId,
        draft.version,
        removeKey,
      ),
    onSuccess: async () => {
      setRemoveKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: PRICE_LISTS_QUERY_KEY });
      toast.show({ title: t('servicePrices.removed'), tone: 'success' });
    },
    onError: (error) => {
      if (wasRefused(error)) setRemoveKey(crypto.randomUUID());
    },
  });
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };
  const removingId =
    remove.isPending && remove.variables ? remove.variables.service.serviceItemId : undefined;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="draft-services-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="draft-services-heading" className="text-base font-semibold">
          {t('servicePrices.title')}
        </h3>
        <Button variant="secondary" onClick={() => setDialog({ kind: 'add' })}>
          {t('servicePrices.add')}
        </Button>
      </div>
      {remove.error ? <Alert tone="danger">{errorMessage(remove.error)}</Alert> : null}
      {draft.servicePrices.length === 0 ? (
        <EmptyState title={t('servicePrices.empty')} />
      ) : (
        <ServicePriceTable
          prices={draft.servicePrices}
          actions={{
            onEdit: (price) => setDialog({ kind: 'edit', price }),
            onRemove: (price) => remove.mutate(price),
            ...(removingId ? { removingId } : {}),
          }}
        />
      )}
      {dialog?.kind === 'add' ? <ServicePriceDialog draft={draft} onOpenChange={close} /> : null}
      {dialog?.kind === 'edit' ? (
        <ServicePriceDialog
          key={`${dialog.price.service.serviceItemId}:${draft.version}`}
          draft={draft}
          price={dialog.price}
          onOpenChange={close}
        />
      ) : null}
    </section>
  );
}
