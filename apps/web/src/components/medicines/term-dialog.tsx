'use client';
// Add or edit a route, frequency or duration (T-CLI-03; Q-067 interim; FR-I18N-006; SP-03). The
// kind is fixed by the list the administrator added from. An edit sends the whole record with the
// version the screen showed; prescriptions already written keep the labels they had.
import type { PrescribingTermKind, PrescribingTermRecord } from '@hms/contracts';
import { Alert, Button, Checkbox, Dialog, Field, TextInput, useToast } from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '../../api/errors';
import { PRESCRIBING_TERMS_QUERY_KEY, prescribingTermsApi } from '../../api/medicines';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import {
  isTermComplete,
  sortOrderOf,
  termDiffers,
  termFieldsOf,
  termFormOf,
  type TermForm,
} from './term-form';
import { TERM_KIND_KEYS } from './term-labels';

const LABEL_FIELDS = [
  { field: 'labelBn', labelKey: 'prescribingTerms.labelBn', lang: 'bn' },
  { field: 'labelEn', labelKey: 'prescribingTerms.labelEn', lang: 'en' },
] as const;

export function TermDialog({
  kind,
  term,
  onOpenChange,
}: {
  kind: PrescribingTermKind;
  /** Absent for a new term. */
  term?: PrescribingTermRecord;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => termFormOf(term));
  const update = (patch: Partial<TermForm>) => setForm((current) => ({ ...current, ...patch }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: PRESCRIBING_TERMS_QUERY_KEY });

  const save = useMutation({
    mutationFn: () =>
      term
        ? prescribingTermsApi.update(term.termId, {
            ...termFieldsOf(form),
            active: form.active,
            expectedVersion: term.version,
          })
        : prescribingTermsApi.create({ kind, ...termFieldsOf(form) }),
    onSuccess: async () => {
      await refresh();
      toast.show({
        title: term ? t('prescribingTerms.saved') : t('prescribingTerms.added'),
        tone: 'success',
      });
      onOpenChange(false);
    },
  });
  const stale = save.error instanceof ApiError && save.error.code === 'STALE_RECORD';
  const canSave = isTermComplete(form) && (!term || termDiffers(term, form));
  const badOrder = form.sortOrder.trim() !== '' && sortOrderOf(form) === null;

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={`${term ? t('prescribingTerms.editTitle') : t('prescribingTerms.addTitle')}: ${t(TERM_KIND_KEYS[kind])}`}
      description={t('prescribingTerms.formHint')}
      footer={
        <Button loading={save.isPending} disabled={!canSave || stale} onClick={() => save.mutate()}>
          {term ? t('prescribingTerms.save') : t('prescribingTerms.add')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {stale ? (
          <div className="flex flex-col items-start gap-2">
            <Alert tone="warning">{t('prescribingTerms.staleNotice')}</Alert>
            <Button
              variant="secondary"
              onClick={() => {
                void refresh();
                onOpenChange(false);
              }}
            >
              {t('prescribingTerms.reload')}
            </Button>
          </div>
        ) : null}
        {save.error && !stale ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
        {LABEL_FIELDS.map(({ field, labelKey, lang }) => (
          <Field key={field} label={t(labelKey)}>
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                lang={lang}
                value={form[field]}
                onChange={(event) => update({ [field]: event.target.value })}
                {...aria}
              />
            )}
          </Field>
        ))}
        <Field
          label={t('prescribingTerms.sortOrder')}
          hint={t('prescribingTerms.sortOrderHint')}
          error={badOrder ? t('prescribingTerms.sortOrderInvalid') : undefined}
        >
          {({ id, ...aria }) => (
            <TextInput
              id={id}
              inputMode="numeric"
              maxLength={4}
              value={form.sortOrder}
              onChange={(event) => update({ sortOrder: event.target.value })}
              {...aria}
            />
          )}
        </Field>
        {term ? (
          <Checkbox
            label={t('prescribingTerms.activeLabel')}
            checked={form.active}
            onChange={(event) => update({ active: event.target.checked })}
          />
        ) : null}
      </div>
    </Dialog>
  );
}
