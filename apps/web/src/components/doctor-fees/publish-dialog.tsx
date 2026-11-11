'use client';
// Publish the draft price list (T-BIL-01; FR-CFG-002; SP-03, SP-08). The dialog first shows what
// changes against the fees in force, doctor by doctor, then the administrator chooses now or the
// start of a later date. Visits checked in before the new version takes effect keep the fee they
// were charged (AT-CFG-002).
import type { PriceList, PriceListChange } from '@hms/contracts';
import { formatMoney, toLocaleDigits, type Locale } from '@hms/i18n';
import { Alert, Button, Dialog, Field, Radio, Skeleton, TextInput, useToast } from '@hms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { wasRefused } from '../../api/errors';
import { PRICE_LISTS_QUERY_KEY, priceListsApi } from '../../api/price-lists';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { hospitalToday } from '../schedules/session-form';
import { effectiveFromOf, type PublishTiming } from './doctor-fee-form';
import { doctorNameOf } from './fee-table';

// Full catalog keys as literals, so the unused-key check can see them.
const CHANGE_LABELS = {
  ADDED: 'doctorFees.changeAdded',
  CHANGED: 'doctorFees.changeChanged',
  REMOVED: 'doctorFees.changeRemoved',
} as const;

function ChangeRow({ change }: { change: PriceListChange }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const describe = (values: NonNullable<PriceListChange['after']>) =>
    t('doctorFees.feeSummary', {
      newPatientFee: formatMoney(values.newPatientFee, locale, { symbol: 'sign' }),
      followUpFee: formatMoney(values.followUpFee, locale, { symbol: 'sign' }),
      days: toLocaleDigits(String(values.followUpDays), locale),
    });
  return (
    <li className="flex flex-col gap-0.5 border-t border-border py-2 first:border-t-0">
      <p className="text-sm">
        <span className="font-medium">{doctorNameOf(change)}</span>
        {' - '}
        {t(CHANGE_LABELS[change.change])}
      </p>
      {change.before ? (
        <p className="text-xs text-text-muted line-through">{describe(change.before)}</p>
      ) : null}
      {change.after ? <p className="text-xs">{describe(change.after)}</p> : null}
    </li>
  );
}

export function PublishDialog({
  draft,
  onOpenChange,
}: {
  draft: PriceList;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [timing, setTiming] = useState<PublishTiming>({ when: 'now', date: '' });
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const changes = useQuery({
    queryKey: [...PRICE_LISTS_QUERY_KEY, draft.priceListId, 'changes', draft.version],
    queryFn: () => priceListsApi.changes(draft.priceListId),
  });
  const effectiveFrom = effectiveFromOf(timing, hospitalToday(new Date()));
  const dateInvalid = timing.when === 'date' && timing.date !== '' && effectiveFrom === null;

  const publish = useMutation({
    mutationFn: () =>
      priceListsApi.publish(
        draft.priceListId,
        {
          expectedVersion: draft.version,
          ...(effectiveFrom ? { effectiveFrom } : {}),
        },
        idempotencyKey,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PRICE_LISTS_QUERY_KEY });
      toast.show({ title: t('doctorFees.published'), tone: 'success' });
      onOpenChange(false);
    },
    onError: (error) => {
      if (wasRefused(error)) setIdempotencyKey(crypto.randomUUID());
    },
  });

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={t('doctorFees.publishTitle')}
      description={t('doctorFees.publishHint')}
      footer={
        <Button
          loading={publish.isPending}
          disabled={effectiveFrom === null || changes.isPending}
          onClick={() => publish.mutate()}
        >
          {t('doctorFees.confirmPublish')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {publish.error ? <Alert tone="danger">{errorMessage(publish.error)}</Alert> : null}
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{t('doctorFees.changesTitle')}</h3>
          {changes.isPending ? <Skeleton className="h-16" /> : null}
          {changes.error ? <Alert tone="danger">{errorMessage(changes.error)}</Alert> : null}
          {changes.data?.changes.length === 0 ? (
            <p className="text-sm text-text-muted">{t('doctorFees.noChanges')}</p>
          ) : null}
          {changes.data && changes.data.changes.length > 0 ? (
            <ul>
              {changes.data.changes.map((change) => (
                <ChangeRow key={change.practitioner.practitionerId} change={change} />
              ))}
            </ul>
          ) : null}
        </section>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">{t('doctorFees.whenTitle')}</legend>
          <Radio
            name="when"
            label={t('doctorFees.whenNow')}
            checked={timing.when === 'now'}
            onChange={() => setTiming({ ...timing, when: 'now' })}
          />
          <Radio
            name="when"
            label={t('doctorFees.whenDate')}
            checked={timing.when === 'date'}
            onChange={() => setTiming({ ...timing, when: 'date' })}
          />
        </fieldset>
        {timing.when === 'date' ? (
          <Field
            label={t('doctorFees.effectiveDate')}
            error={dateInvalid ? t('doctorFees.dateInvalid') : undefined}
          >
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                type="date"
                value={timing.date}
                onChange={(event) => setTiming({ ...timing, date: event.target.value })}
                {...aria}
              />
            )}
          </Field>
        ) : null}
      </div>
    </Dialog>
  );
}
