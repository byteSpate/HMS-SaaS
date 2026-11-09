'use client';
// Add or edit a department (T-PRA-02; FR-CFG-001, FR-I18N-006; SP-03). One dialog for both: empty
// for a new department, prefilled for an edit, which sends the whole record with the version the
// screen showed. A code another department has is shown on the code field; if someone else saved
// first, the API answers STALE_RECORD and the dialog offers to reload.
import type { DepartmentRecord } from '@hms/contracts';
import { Alert, Button, Checkbox, Dialog, Field, TextInput, useToast } from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DEPARTMENTS_QUERY_KEY, departmentsApi } from '../../api/departments';
import { ApiError } from '../../api/errors';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import {
  codeProblem,
  differsFrom,
  fieldsOf,
  formOf,
  hasName,
  hasValidCode,
  isCodeTaken,
  type DepartmentForm,
} from './department-form';

// Full catalog keys as literals, so the unused-key check can see them.
const NAME_FIELDS = [
  { field: 'nameBn', labelKey: 'departments.nameBn', lang: 'bn' },
  { field: 'nameEn', labelKey: 'departments.nameEn', lang: 'en' },
] as const;
const CODE_MESSAGES = {
  codeTaken: 'departments.codeTaken',
  codeInvalid: 'departments.codeInvalid',
} as const;

export function DepartmentDialog({
  department,
  onOpenChange,
}: {
  /** Absent for a new department. */
  department?: DepartmentRecord;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => formOf(department));
  const update = (patch: Partial<DepartmentForm>) =>
    setForm((current) => ({ ...current, ...patch }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: DEPARTMENTS_QUERY_KEY });

  const save = useMutation({
    mutationFn: () =>
      department
        ? departmentsApi.update(department.departmentId, {
            ...fieldsOf(form),
            active: form.active,
            expectedVersion: department.version,
          })
        : departmentsApi.create(fieldsOf(form)),
    onSuccess: async () => {
      await refresh();
      toast.show({
        title: department ? t('departments.saved') : t('departments.added'),
        tone: 'success',
      });
      onOpenChange(false);
    },
  });
  const stale = save.error instanceof ApiError && save.error.code === 'STALE_RECORD';
  const codeTaken = isCodeTaken(save.error);
  const problem = codeProblem(form, save.error);
  const canSave =
    hasValidCode(form) && hasName(form) && (!department || differsFrom(department, form));

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={department ? t('departments.editTitle') : t('departments.addTitle')}
      description={t('departments.formHint')}
      footer={
        <Button loading={save.isPending} disabled={!canSave || stale} onClick={() => save.mutate()}>
          {department ? t('departments.save') : t('departments.add')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {stale ? (
          <div className="flex flex-col items-start gap-2">
            <Alert tone="warning">{t('departments.staleNotice')}</Alert>
            <Button
              variant="secondary"
              onClick={() => {
                void refresh();
                onOpenChange(false);
              }}
            >
              {t('departments.reload')}
            </Button>
          </div>
        ) : null}
        {save.error && !stale && !codeTaken ? (
          <Alert tone="danger">{errorMessage(save.error)}</Alert>
        ) : null}
        <Field
          label={t('departments.code')}
          hint={t('departments.codeHint')}
          error={problem ? t(CODE_MESSAGES[problem]) : undefined}
        >
          {({ id, ...aria }) => (
            <TextInput
              id={id}
              autoCapitalize="characters"
              maxLength={20}
              value={form.code}
              onChange={(event) => update({ code: event.target.value.toUpperCase() })}
              {...aria}
            />
          )}
        </Field>
        {NAME_FIELDS.map(({ field, labelKey, lang }) => (
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
        {hasName(form) ? null : (
          <p className="text-sm text-text-muted">{t('departments.nameRequired')}</p>
        )}
        {/* A new department is always active; deactivating is an edit. */}
        {department ? (
          <Checkbox
            label={t('departments.activeLabel')}
            checked={form.active}
            onChange={(event) => update({ active: event.target.checked })}
          />
        ) : null}
      </div>
    </Dialog>
  );
}
