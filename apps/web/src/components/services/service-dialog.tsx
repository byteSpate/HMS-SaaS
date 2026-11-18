'use client';
// Add or edit a service (T-ORD-01; FR-ORD-001, FR-ORD-007, FR-I18N-006; SP-03). The code and the
// category are chosen once; an edit sends the editable record with the version the screen
// showed. A code in use is shown on the code field; a stale edit offers to reload.
import { ORDERABLE_CATEGORIES, type ServiceRecord } from '@hms/contracts';
import { Alert, Button, Checkbox, Dialog, Field, Select, TextInput, useToast } from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '../../api/errors';
import { SERVICES_QUERY_KEY, servicesApi } from '../../api/services';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import {
  hasValidServiceCode,
  isCodeTaken,
  isServiceComplete,
  reportHoursOf,
  serviceDiffers,
  serviceFieldsOf,
  serviceFormOf,
  type ServiceForm,
} from './service-form';
import { CATEGORY_KEYS } from './service-labels';

const NAME_FIELDS = [
  { field: 'nameBn', labelKey: 'services.nameBn', lang: 'bn' },
  { field: 'nameEn', labelKey: 'services.nameEn', lang: 'en' },
] as const;

/** A new service's code and category, which never change once saved. */
function CodeAndCategory({
  form,
  codeTaken,
  onChange,
}: {
  form: ServiceForm;
  codeTaken: boolean;
  onChange: (patch: Partial<ServiceForm>) => void;
}) {
  const t = useTranslations();
  let codeError: string | undefined;
  if (codeTaken) codeError = t('services.codeTaken');
  else if (form.code.trim() !== '' && !hasValidServiceCode(form)) {
    codeError = t('services.codeInvalid');
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('services.code')} hint={t('services.codeHint')} error={codeError}>
        {({ id, ...aria }) => (
          <TextInput
            id={id}
            autoCapitalize="characters"
            maxLength={40}
            value={form.code}
            onChange={(event) => onChange({ code: event.target.value.toUpperCase() })}
            {...aria}
          />
        )}
      </Field>
      <Field label={t('services.category')}>
        {({ id, ...aria }) => (
          <Select
            id={id}
            value={form.category}
            options={ORDERABLE_CATEGORIES.map((category) => ({
              value: category,
              label: t(CATEGORY_KEYS[category]),
            }))}
            onChange={(event) =>
              onChange({ category: event.target.value as ServiceForm['category'] })
            }
            {...aria}
          />
        )}
      </Field>
    </div>
  );
}

export function ServiceDialog({
  service,
  onOpenChange,
}: {
  /** Absent for a new service. */
  service?: ServiceRecord;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => serviceFormOf(service));
  const update = (patch: Partial<ServiceForm>) => setForm((current) => ({ ...current, ...patch }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: SERVICES_QUERY_KEY });

  const save = useMutation({
    mutationFn: () =>
      service
        ? servicesApi.update(service.serviceItemId, {
            ...serviceFieldsOf(form),
            active: form.active,
            expectedVersion: service.version,
          })
        : servicesApi.create({
            code: form.code.trim().toUpperCase(),
            category: form.category,
            ...serviceFieldsOf(form),
          }),
    onSuccess: async () => {
      await refresh();
      toast.show({ title: service ? t('services.saved') : t('services.added'), tone: 'success' });
      onOpenChange(false);
    },
  });
  const stale = save.error instanceof ApiError && save.error.code === 'STALE_RECORD';
  const codeTaken = isCodeTaken(save.error);
  const canSave = isServiceComplete(form, !service) && (!service || serviceDiffers(service, form));

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={service ? t('services.editTitle') : t('services.addTitle')}
      description={t('services.formHint')}
      footer={
        <Button loading={save.isPending} disabled={!canSave || stale} onClick={() => save.mutate()}>
          {service ? t('services.save') : t('services.add')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {stale ? (
          <div className="flex flex-col items-start gap-2">
            <Alert tone="warning">{t('services.staleNotice')}</Alert>
            <Button
              variant="secondary"
              onClick={() => {
                void refresh();
                onOpenChange(false);
              }}
            >
              {t('services.reload')}
            </Button>
          </div>
        ) : null}
        {save.error && !stale && !codeTaken ? (
          <Alert tone="danger">{errorMessage(save.error)}</Alert>
        ) : null}
        {service ? null : <CodeAndCategory form={form} codeTaken={codeTaken} onChange={update} />}
        {NAME_FIELDS.map(({ field, labelKey, lang }) => (
          <Field key={field} label={t(labelKey)}>
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                lang={lang}
                maxLength={120}
                value={form[field]}
                onChange={(event) => update({ [field]: event.target.value })}
                {...aria}
              />
            )}
          </Field>
        ))}
        <Field
          label={t('services.reportHours')}
          hint={t('services.reportHoursHint')}
          error={reportHoursOf(form) === undefined ? t('services.reportHoursInvalid') : undefined}
        >
          {({ id, ...aria }) => (
            <TextInput
              id={id}
              inputMode="numeric"
              maxLength={3}
              value={form.reportHours}
              onChange={(event) => update({ reportHours: event.target.value })}
              {...aria}
            />
          )}
        </Field>
        <Checkbox
          label={t('services.directlyOrderableLabel')}
          checked={form.directlyOrderable}
          onChange={(event) => update({ directlyOrderable: event.target.checked })}
        />
        {service ? (
          <Checkbox
            label={t('services.activeLabel')}
            checked={form.active}
            onChange={(event) => update({ active: event.target.checked })}
          />
        ) : null}
      </div>
    </Dialog>
  );
}
