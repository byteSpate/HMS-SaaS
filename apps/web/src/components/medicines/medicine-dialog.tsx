'use client';
// Add or edit a medicine (T-CLI-03; FR-CLI-004, FR-PHA-011 subset; SP-03). One dialog for both:
// empty for a new medicine, prefilled for an edit, which sends the whole record with the version
// the screen showed. The same brand, strength and form twice is shown on the brand field; if
// someone else saved first, the API answers STALE_RECORD and the dialog offers to reload.
import type { MedicineRecord } from '@hms/contracts';
import { Alert, Button, Checkbox, Dialog, Field, TextInput, useToast } from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '../../api/errors';
import { MEDICINES_QUERY_KEY, medicinesApi } from '../../api/medicines';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import {
  isDuplicateMedicine,
  isMedicineComplete,
  medicineDiffers,
  medicineFieldsOf,
  medicineFormOf,
  type MedicineForm,
} from './medicine-form';

// Full catalog keys as literals, so the unused-key check can see them.
const TEXT_FIELDS = [
  { field: 'brandName', labelKey: 'medicines.brandName', hintKey: 'medicines.brandHint' },
  { field: 'genericName', labelKey: 'medicines.genericName', hintKey: null },
  { field: 'strength', labelKey: 'medicines.strength', hintKey: 'medicines.strengthHint' },
  { field: 'form', labelKey: 'medicines.form', hintKey: 'medicines.formFieldHint' },
  { field: 'nameBn', labelKey: 'medicines.nameBn', hintKey: null },
  { field: 'manufacturer', labelKey: 'medicines.manufacturer', hintKey: null },
] as const;

export function MedicineDialog({
  medicine,
  onOpenChange,
}: {
  /** Absent for a new medicine. */
  medicine?: MedicineRecord;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => medicineFormOf(medicine));
  const update = (patch: Partial<MedicineForm>) => setForm((current) => ({ ...current, ...patch }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: MEDICINES_QUERY_KEY });

  const save = useMutation({
    mutationFn: () =>
      medicine
        ? medicinesApi.update(medicine.medicineId, {
            ...medicineFieldsOf(form),
            active: form.active,
            expectedVersion: medicine.version,
          })
        : medicinesApi.create(medicineFieldsOf(form)),
    onSuccess: async () => {
      await refresh();
      toast.show({
        title: medicine ? t('medicines.saved') : t('medicines.added'),
        tone: 'success',
      });
      onOpenChange(false);
    },
  });
  const stale = save.error instanceof ApiError && save.error.code === 'STALE_RECORD';
  const duplicate = isDuplicateMedicine(save.error);
  const canSave = isMedicineComplete(form) && (!medicine || medicineDiffers(medicine, form));

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={medicine ? t('medicines.editTitle') : t('medicines.addTitle')}
      description={t('medicines.formHint')}
      footer={
        <Button loading={save.isPending} disabled={!canSave || stale} onClick={() => save.mutate()}>
          {medicine ? t('medicines.save') : t('medicines.add')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {stale ? (
          <div className="flex flex-col items-start gap-2">
            <Alert tone="warning">{t('medicines.staleNotice')}</Alert>
            <Button
              variant="secondary"
              onClick={() => {
                void refresh();
                onOpenChange(false);
              }}
            >
              {t('medicines.reload')}
            </Button>
          </div>
        ) : null}
        {save.error && !stale && !duplicate ? (
          <Alert tone="danger">{errorMessage(save.error)}</Alert>
        ) : null}
        {TEXT_FIELDS.map(({ field, labelKey, hintKey }) => (
          <Field
            key={field}
            label={t(labelKey)}
            hint={hintKey ? t(hintKey) : undefined}
            error={field === 'brandName' && duplicate ? t('medicines.duplicate') : undefined}
          >
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                lang={field === 'nameBn' ? 'bn' : undefined}
                value={form[field]}
                onChange={(event) => update({ [field]: event.target.value })}
                {...aria}
              />
            )}
          </Field>
        ))}
        {/* A new medicine is always active; deactivating is an edit. */}
        {medicine ? (
          <Checkbox
            label={t('medicines.activeLabel')}
            checked={form.active}
            onChange={(event) => update({ active: event.target.checked })}
          />
        ) : null}
      </div>
    </Dialog>
  );
}
