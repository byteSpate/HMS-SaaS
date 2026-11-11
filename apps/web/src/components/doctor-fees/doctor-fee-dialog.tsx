'use client';
// Add or edit one doctor's fee in the draft price list (T-BIL-01; C-041; SP-03, SP-08). A new fee
// picks the doctor from the hospital's active practitioners; an edit keeps its doctor. Amounts may
// be typed with Bangla or Western digits and are sent as "500.00". If someone else changed the
// draft first, the API answers STALE_RECORD and the dialog offers to reload.
import type { DoctorFee, PriceList } from '@hms/contracts';
import { Alert, Button, Dialog, Field, Select, Skeleton, TextInput, useToast } from '@hms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError, wasRefused } from '../../api/errors';
import { PRICE_LISTS_QUERY_KEY, priceListsApi } from '../../api/price-lists';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { amountOf, daysOf, formOf, requestOf, type FeeForm } from './doctor-fee-form';
import { doctorNameOf } from './fee-table';

// Full catalog keys as literals, so the unused-key check can see them.
const AMOUNT_FIELDS = [
  { field: 'newPatientFee', labelKey: 'doctorFees.newPatientFee' },
  { field: 'followUpFee', labelKey: 'doctorFees.followUpFee' },
] as const;

export function DoctorFeeDialog({
  draft,
  fee,
  onOpenChange,
}: {
  draft: PriceList;
  /** Absent when adding a fee for a doctor who has none in the draft. */
  fee?: DoctorFee;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => formOf(fee));
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const update = (patch: Partial<FeeForm>) => setForm((current) => ({ ...current, ...patch }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: PRICE_LISTS_QUERY_KEY });
  const choices = useQuery({
    queryKey: [...PRICE_LISTS_QUERY_KEY, 'practitioner-choices'],
    queryFn: priceListsApi.practitionerChoices,
    enabled: !fee,
  });
  // A doctor who already has a fee is edited from the table, not added twice.
  const taken = new Set(draft.doctorFees.map((row) => row.practitioner.practitionerId));
  const options = (choices.data ?? [])
    .filter((choice) => !taken.has(choice.practitionerId))
    .map((choice) => ({
      value: choice.practitionerId,
      label: choice.nameEn ?? choice.nameBn ?? '',
    }));
  const request = requestOf(form, draft.version);

  const save = useMutation({
    mutationFn: () => {
      if (!request) throw new Error('The form is not complete');
      return priceListsApi.setDoctorFee(
        draft.priceListId,
        form.practitionerId,
        request,
        idempotencyKey,
      );
    },
    onSuccess: async () => {
      await refresh();
      toast.show({ title: t('doctorFees.saved'), tone: 'success' });
      onOpenChange(false);
    },
    onError: (error) => {
      // A refusal saved nothing, so a retry is a new request; after a timeout the same key lets
      // the server replay what it saved.
      if (wasRefused(error)) setIdempotencyKey(crypto.randomUUID());
    },
  });
  const stale = save.error instanceof ApiError && save.error.code === 'STALE_RECORD';
  const invalid = (field: 'newPatientFee' | 'followUpFee') =>
    form[field].trim() !== '' && amountOf(form[field]) === null;
  const daysInvalid = form.followUpDays.trim() !== '' && daysOf(form.followUpDays) === null;

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={fee ? t('doctorFees.editTitle') : t('doctorFees.addTitle')}
      description={t('doctorFees.formHint')}
      footer={
        <Button loading={save.isPending} disabled={!request || stale} onClick={() => save.mutate()}>
          {t('doctorFees.save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {stale ? (
          <div className="flex flex-col items-start gap-2">
            <Alert tone="warning">{t('doctorFees.staleNotice')}</Alert>
            <Button
              variant="secondary"
              onClick={() => {
                void refresh();
                onOpenChange(false);
              }}
            >
              {t('doctorFees.reload')}
            </Button>
          </div>
        ) : null}
        {save.error && !stale ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
        {fee ? (
          <p className="text-sm font-medium">{doctorNameOf(fee)}</p>
        ) : (
          <Field label={t('doctorFees.doctor')}>
            {({ id, ...aria }) =>
              choices.isPending ? (
                <Skeleton className="h-10" />
              ) : (
                <Select
                  id={id}
                  value={form.practitionerId}
                  onChange={(event) => update({ practitionerId: event.target.value })}
                  options={[{ value: '', label: t('doctorFees.chooseDoctor') }, ...options]}
                  {...aria}
                />
              )
            }
          </Field>
        )}
        {choices.error ? <Alert tone="danger">{errorMessage(choices.error)}</Alert> : null}
        {AMOUNT_FIELDS.map(({ field, labelKey }) => (
          <Field
            key={field}
            label={t(labelKey)}
            error={invalid(field) ? t('doctorFees.amountInvalid') : undefined}
          >
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                inputMode="decimal"
                value={form[field]}
                onChange={(event) => update({ [field]: event.target.value })}
                {...aria}
              />
            )}
          </Field>
        ))}
        <Field
          label={t('doctorFees.followUpDays')}
          hint={t('doctorFees.followUpHint')}
          error={daysInvalid ? t('doctorFees.daysInvalid') : undefined}
        >
          {({ id, ...aria }) => (
            <TextInput
              id={id}
              inputMode="numeric"
              value={form.followUpDays}
              onChange={(event) => update({ followUpDays: event.target.value })}
              {...aria}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
