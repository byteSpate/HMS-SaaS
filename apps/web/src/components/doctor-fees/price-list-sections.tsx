'use client';
// The three parts of the doctor-fee screen (T-BIL-01; FR-CFG-002; C-041): the draft being edited,
// the versions scheduled for a later date, and the fees in force. Each reads its own version, so
// the page only decides which parts to show.
import type { DoctorFee, PriceList, PriceListSummary } from '@hms/contracts';
import { formatDateTime, toLocaleDigits, type Locale } from '@hms/i18n';
import { Alert, Button, Skeleton, useToast } from '@hms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { wasRefused } from '../../api/errors';
import { PRICE_LISTS_QUERY_KEY, priceListsApi } from '../../api/price-lists';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { FeeTable } from './fee-table';

export function usePriceList(summary: PriceListSummary | undefined) {
  return useQuery({
    queryKey: [...PRICE_LISTS_QUERY_KEY, summary?.priceListId, summary?.version],
    queryFn: () => priceListsApi.get(summary?.priceListId ?? ''),
    enabled: summary !== undefined,
  });
}

function useFormatters() {
  const locale = useLocale() as Locale;
  return {
    when: (iso: string | null) => (iso ? formatDateTime(iso, locale) : ''),
    number: (value: number) => toLocaleDigits(String(value), locale),
  };
}

export function DraftSection({
  draft,
  onAdd,
  onEdit,
  onPublish,
}: {
  draft: PriceList | undefined;
  onAdd: () => void;
  onEdit: (fee: DoctorFee) => void;
  onPublish: () => void;
}) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { number } = useFormatters();
  const [removeKey, setRemoveKey] = useState(() => crypto.randomUUID());
  const remove = useMutation({
    mutationFn: (fee: DoctorFee) =>
      priceListsApi.removeDoctorFee(
        draft?.priceListId ?? '',
        fee.practitioner.practitionerId,
        draft?.version ?? 0,
        removeKey,
      ),
    onSuccess: async () => {
      setRemoveKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: PRICE_LISTS_QUERY_KEY });
      toast.show({ title: t('doctorFees.removed'), tone: 'success' });
    },
    onError: (error) => {
      if (wasRefused(error)) setRemoveKey(crypto.randomUUID());
    },
  });
  const removingId =
    remove.isPending && remove.variables ? remove.variables.practitioner.practitionerId : undefined;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="draft-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="draft-heading" className="text-base font-semibold">
            {t('doctorFees.draftTitle', { version: number(draft?.versionNo ?? 0) })}
          </h2>
          <p className="text-sm text-text-muted">{t('doctorFees.draftHint')}</p>
        </div>
        <span className="flex gap-2">
          <Button variant="secondary" disabled={!draft} onClick={onAdd}>
            {t('doctorFees.add')}
          </Button>
          <Button disabled={!draft} onClick={onPublish}>
            {t('doctorFees.publish')}
          </Button>
        </span>
      </div>
      {remove.error ? <Alert tone="danger">{errorMessage(remove.error)}</Alert> : null}
      {draft ? null : <Skeleton className="h-24" />}
      {draft?.doctorFees.length === 0 ? (
        <p className="text-sm text-text-muted">{t('doctorFees.empty')}</p>
      ) : null}
      {draft && draft.doctorFees.length > 0 ? (
        <FeeTable
          fees={draft.doctorFees}
          actions={{
            onEdit,
            onRemove: (fee) => remove.mutate(fee),
            ...(removingId ? { removingId } : {}),
          }}
        />
      ) : null}
    </section>
  );
}

export function ScheduledVersions({ versions }: { versions: PriceListSummary[] }) {
  const t = useTranslations();
  const { when, number } = useFormatters();
  return (
    <section className="flex flex-col gap-1" aria-labelledby="scheduled-heading">
      <h2 id="scheduled-heading" className="text-base font-semibold">
        {t('doctorFees.scheduledTitle')}
      </h2>
      <ul className="text-sm">
        {versions.map((version) => (
          <li key={version.priceListId}>
            {t('doctorFees.scheduled', {
              version: number(version.versionNo),
              date: when(version.effectiveFrom),
            })}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function InForceSection({ summary }: { summary: PriceListSummary | undefined }) {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const { when, number } = useFormatters();
  const inForce = usePriceList(summary);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="in-force-heading">
      <div>
        <h2 id="in-force-heading" className="text-base font-semibold">
          {t('doctorFees.inForceTitle')}
        </h2>
        <p className="text-sm text-text-muted">
          {summary
            ? t('doctorFees.inForceSince', {
                version: number(summary.versionNo),
                date: when(summary.effectiveFrom),
              })
            : t('doctorFees.noneInForce')}
        </p>
      </div>
      {inForce.error ? <Alert tone="danger">{errorMessage(inForce.error)}</Alert> : null}
      {inForce.data && inForce.data.doctorFees.length > 0 ? (
        <FeeTable fees={inForce.data.doctorFees} />
      ) : null}
    </section>
  );
}
