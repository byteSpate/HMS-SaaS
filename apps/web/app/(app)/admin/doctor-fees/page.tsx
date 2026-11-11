'use client';
// Doctor fees (T-BIL-01; FR-CFG-001, FR-CFG-002; C-041): the draft being edited, versions
// scheduled for a later date, and the fees in force. Fees change only through a draft that is
// published, so what check-in charged stays on record (AT-CFG-002). admin.price.publish; the API
// enforces it.
import type { PriceListSummary } from '@hms/contracts';
import { Alert, Button, PageLayout, Skeleton } from '@hms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { wasRefused } from '../../../../src/api/errors';
import { PRICE_LISTS_QUERY_KEY, priceListsApi } from '../../../../src/api/price-lists';
import { DoctorFeeDialog } from '../../../../src/components/doctor-fees/doctor-fee-dialog';
import {
  DraftSection,
  InForceSection,
  ScheduledVersions,
  usePriceList,
} from '../../../../src/components/doctor-fees/price-list-sections';
import { PublishDialog } from '../../../../src/components/doctor-fees/publish-dialog';
import { useApiErrorMessage } from '../../../../src/i18n/use-api-error-message';

/** The add dialog, the edit dialog for one doctor, or the publish dialog. */
type OpenDialog =
  { kind: 'add' } | { kind: 'edit'; practitionerId: string } | { kind: 'publish' } | null;

/** Published but not in force yet: a version that takes effect later (FR-CFG-002). */
const isScheduled = (version: PriceListSummary) =>
  version.status === 'PUBLISHED' &&
  !version.inForce &&
  version.effectiveFrom !== null &&
  new Date(version.effectiveFrom).getTime() > Date.now();

export default function DoctorFeesPage() {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [draftKey, setDraftKey] = useState(() => crypto.randomUUID());
  const versions = useQuery({ queryKey: PRICE_LISTS_QUERY_KEY, queryFn: priceListsApi.list });
  const summaries = versions.data ?? [];
  const draftSummary = summaries.find((version) => version.status === 'DRAFT');
  const scheduled = summaries.filter(isScheduled);
  const draft = usePriceList(draftSummary).data;
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  const startDraft = useMutation({
    mutationFn: () => priceListsApi.createDraft(draftKey),
    onSuccess: async () => {
      setDraftKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: PRICE_LISTS_QUERY_KEY });
    },
    onError: (error) => {
      if (wasRefused(error)) setDraftKey(crypto.randomUUID());
    },
  });
  const editing =
    dialog?.kind === 'edit'
      ? draft?.doctorFees.find((fee) => fee.practitioner.practitionerId === dialog.practitionerId)
      : undefined;

  return (
    <PageLayout
      title={t('doctorFees.title')}
      description={t('doctorFees.description')}
      actions={
        versions.data && !draftSummary ? (
          <Button loading={startDraft.isPending} onClick={() => startDraft.mutate()}>
            {t('doctorFees.startDraft')}
          </Button>
        ) : null
      }
    >
      {versions.error ? <Alert tone="danger">{errorMessage(versions.error)}</Alert> : null}
      {startDraft.error ? <Alert tone="danger">{errorMessage(startDraft.error)}</Alert> : null}
      {versions.isPending ? <Skeleton className="h-40" /> : null}
      {draftSummary ? (
        <DraftSection
          draft={draft}
          onAdd={() => setDialog({ kind: 'add' })}
          onEdit={(fee) =>
            setDialog({ kind: 'edit', practitionerId: fee.practitioner.practitionerId })
          }
          onPublish={() => setDialog({ kind: 'publish' })}
        />
      ) : null}
      {scheduled.length > 0 ? <ScheduledVersions versions={scheduled} /> : null}
      {versions.data ? (
        <InForceSection summary={summaries.find((version) => version.inForce)} />
      ) : null}

      {dialog?.kind === 'add' && draft ? (
        <DoctorFeeDialog draft={draft} onOpenChange={close} />
      ) : null}
      {editing && draft ? (
        <DoctorFeeDialog
          key={`${editing.practitioner.practitionerId}:${draft.version}`}
          draft={draft}
          fee={editing}
          onOpenChange={close}
        />
      ) : null}
      {dialog?.kind === 'publish' && draft ? (
        <PublishDialog draft={draft} onOpenChange={close} />
      ) : null}
    </PageLayout>
  );
}
