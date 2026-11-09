'use client';
// Add or edit a practitioner (T-PRA-01; FR-PRA-001..003; SP-03). One dialog for both: empty for a
// new practitioner, prefilled for an edit, which sends the whole record with the version the
// screen showed. If someone else saved first, the API answers STALE_RECORD and the dialog offers
// to reload. Saving refreshes every practitioner list at once (FR-PRA-002).
import type { Practitioner } from '@hms/contracts';
import { Alert, Button, Checkbox, Dialog, Field, Select, TextInput, useToast } from '@hms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '../../api/errors';
import {
  DEPARTMENT_CHOICES_QUERY_KEY,
  PRACTITIONERS_QUERY_KEY,
  practitionersApi,
} from '../../api/practitioners';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import {
  departmentOptions,
  differsFrom,
  fieldsOf,
  formOf,
  hasName,
  type PractitionerForm,
  type PractitionerTextField,
} from './practitioner-form';

// Full catalog keys as literals, so the unused-key check can see them.
const TEXT_FIELDS: readonly {
  field: PractitionerTextField;
  labelKey: `practitioners.${PractitionerTextField}`;
  lang?: 'bn' | 'en';
  inputMode?: 'tel';
}[] = [
  { field: 'nameBn', labelKey: 'practitioners.nameBn', lang: 'bn' },
  { field: 'nameEn', labelKey: 'practitioners.nameEn', lang: 'en' },
  { field: 'degrees', labelKey: 'practitioners.degrees' },
  { field: 'specialty', labelKey: 'practitioners.specialty' },
  { field: 'phone', labelKey: 'practitioners.phone', inputMode: 'tel' },
  { field: 'registrationNo', labelKey: 'practitioners.registrationNo' },
];

export function PractitionerDialog({
  practitioner,
  onOpenChange,
}: {
  /** Absent for a new practitioner. */
  practitioner?: Practitioner;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => formOf(practitioner));
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const update = (patch: Partial<PractitionerForm>) =>
    setForm((current) => ({ ...current, ...patch }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: PRACTITIONERS_QUERY_KEY });
  const departments = useQuery({
    queryKey: DEPARTMENT_CHOICES_QUERY_KEY,
    queryFn: practitionersApi.departmentChoices,
  });

  const save = useMutation({
    mutationFn: () =>
      practitioner
        ? practitionersApi.update(
            practitioner.practitionerId,
            { ...fieldsOf(form), active: form.active, expectedVersion: practitioner.version },
            idempotencyKey,
          )
        : practitionersApi.create(fieldsOf(form), idempotencyKey),
    onSuccess: async () => {
      await refresh();
      const title = practitioner ? t('practitioners.saved') : t('practitioners.added');
      toast.show({ title, tone: 'success' });
      onOpenChange(false);
    },
  });
  const stale = save.error instanceof ApiError && save.error.code === 'STALE_RECORD';
  const canSave = hasName(form) && (!practitioner || differsFrom(practitioner, form));

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={practitioner ? t('practitioners.editTitle') : t('practitioners.addTitle')}
      description={t('practitioners.formHint')}
      footer={
        <Button loading={save.isPending} disabled={!canSave || stale} onClick={() => save.mutate()}>
          {practitioner ? t('practitioners.save') : t('practitioners.add')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {stale ? (
          <div className="flex flex-col items-start gap-2">
            <Alert tone="warning">{t('practitioners.staleNotice')}</Alert>
            <Button
              variant="secondary"
              onClick={() => {
                void refresh();
                onOpenChange(false);
              }}
            >
              {t('practitioners.reload')}
            </Button>
          </div>
        ) : null}
        {save.error && !stale ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {TEXT_FIELDS.map(({ field, labelKey, lang, inputMode }) => (
            <Field key={field} label={t(labelKey)}>
              {({ id, ...aria }) => (
                <TextInput
                  id={id}
                  {...(lang ? { lang } : {})}
                  {...(inputMode ? { inputMode } : {})}
                  value={form[field]}
                  onChange={(event) => update({ [field]: event.target.value })}
                  {...aria}
                />
              )}
            </Field>
          ))}
        </div>
        <Field label={t('practitioners.department')}>
          {({ id, ...aria }) => (
            <Select
              id={id}
              options={departmentOptions(
                departments.data ?? [],
                practitioner?.department ?? null,
                t('practitioners.noDepartment'),
              )}
              value={form.departmentId}
              onChange={(event) => update({ departmentId: event.target.value })}
              {...aria}
            />
          )}
        </Field>
        {hasName(form) ? null : (
          <p className="text-sm text-text-muted">{t('practitioners.nameRequired')}</p>
        )}
        {/* A new practitioner is always active; deactivating is an edit. */}
        {practitioner ? (
          <Checkbox
            label={t('practitioners.activeLabel')}
            checked={form.active}
            onChange={(event) => update({ active: event.target.checked })}
          />
        ) : null}
      </div>
    </Dialog>
  );
}
