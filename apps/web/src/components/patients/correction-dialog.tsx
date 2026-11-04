'use client';
// SCR-03 identity correction (T-PAT-04; UC-PAT-02; FR-PAT-008; SP-03). Prefilled with the current
// values; only what the user changed is sent, with a reason and the version the screen showed. If
// someone else saved first, the API answers STALE_RECORD and the dialog offers to reload.
import {
  patientSexes,
  type PatientDetail,
  type PatientSex,
} from '@hms/contracts';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  Field,
  Select,
  TextArea,
  TextInput,
  useToast,
} from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '../../api/errors';
import { patientsApi } from '../../api/patients';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { changesOf, formOf, type CorrectionForm } from './correction-changes';
import { usePatientText } from './patient-text';

export function CorrectionDialog({
  patient,
  onOpenChange,
}: {
  patient: PatientDetail;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const toast = useToast();
  const text = usePatientText();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => formOf(patient));
  const [reason, setReason] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const update = (patch: Partial<CorrectionForm>) =>
    setForm((current) => ({ ...current, ...patch }));
  const changes = changesOf(patient, form);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['patients'] });

  const correct = useMutation({
    mutationFn: () =>
      patientsApi.correct(
        patient.patientId,
        { expectedVersion: patient.version, reason: reason.trim(), changes },
        idempotencyKey,
      ),
    onSuccess: async () => {
      await refresh();
      toast.show({ title: t('patients.corrected'), tone: 'success' });
      onOpenChange(false);
    },
  });
  const stale = correct.error instanceof ApiError && correct.error.code === 'STALE_RECORD';
  const canSave = Object.keys(changes).length > 0 && reason.trim().length >= 3;
  const sexOptions = patientSexes.map((sex) => ({ value: sex, label: text.sex(sex) }));

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={t('patients.correctTitle')}
      description={t('patients.correctHint')}
      footer={
        <Button
          loading={correct.isPending}
          disabled={!canSave || stale}
          onClick={() => correct.mutate()}
        >
          {t('patients.save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {stale ? (
          <div className="flex flex-col items-start gap-2">
            <Alert tone="warning">{t('patients.staleNotice')}</Alert>
            <Button
              variant="secondary"
              onClick={() => {
                void refresh();
                onOpenChange(false);
              }}
            >
              {t('patients.reload')}
            </Button>
          </div>
        ) : null}
        {correct.error && !stale ? (
          <Alert tone="danger">{errorMessage(correct.error)}</Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('patients.nameBn')}>
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                lang="bn"
                value={form.nameBn}
                onChange={(event) => update({ nameBn: event.target.value })}
                {...aria}
              />
            )}
          </Field>
          <Field label={t('patients.nameEn')}>
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                lang="en"
                value={form.nameEn}
                onChange={(event) => update({ nameEn: event.target.value })}
                {...aria}
              />
            )}
          </Field>
          <Field label={t('patients.sex')}>
            {({ id, ...aria }) => (
              <Select
                id={id}
                options={sexOptions}
                value={form.sex}
                onChange={(event) => update({ sex: event.target.value as PatientSex })}
                {...aria}
              />
            )}
          </Field>
          <div />
          <Field label={t('patients.birthDate')} hint={t('patients.birthHint')}>
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                type="date"
                value={form.birthDate}
                disabled={form.age.trim() !== ''}
                onChange={(event) => update({ birthDate: event.target.value })}
                {...aria}
              />
            )}
          </Field>
          <Field label={t('patients.age')}>
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                inputMode="numeric"
                value={form.age}
                onChange={(event) => update({ age: event.target.value })}
                {...aria}
              />
            )}
          </Field>
          <div className="flex flex-col gap-2">
            <Field label={t('patients.phone')}>
              {({ id, ...aria }) => (
                <TextInput
                  id={id}
                  type="tel"
                  value={form.phone}
                  disabled={form.noPhone}
                  onChange={(event) => update({ phone: event.target.value })}
                  {...aria}
                />
              )}
            </Field>
            <Checkbox
              label={t('patients.noPhone')}
              checked={form.noPhone}
              onChange={(event) => update({ noPhone: event.target.checked, phone: '' })}
            />
          </div>
          <Field label={t('patients.nid')} hint={text.nid(patient.nidLast4)}>
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                inputMode="numeric"
                autoComplete="off"
                value={form.nid}
                onChange={(event) => update({ nid: event.target.value })}
                {...aria}
              />
            )}
          </Field>
        </div>
        <Field label={t('patients.address')}>
          {({ id, ...aria }) => (
            <TextInput
              id={id}
              value={form.address}
              onChange={(event) => update({ address: event.target.value })}
              {...aria}
            />
          )}
        </Field>
        <Field label={t('patients.reason')} required>
          {({ id, required, ...aria }) => (
            <TextArea
              id={id}
              required={required}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              {...aria}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
