'use client';
// Add a schedule session (T-SCH-01; FR-SCH-002; C-035). The doctor comes from the active
// practitioners, the date and times are on the hospital clock, and the capacity is fixed. The API
// refuses an ended session, an overlap with the same doctor's session or an inactive doctor; the
// refusal is shown on the field it concerns. Saving refreshes the week's list.
import { Alert, Button, Dialog, Field, Select, TextInput, useToast } from '@hms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  SCHEDULE_PRACTITIONERS_QUERY_KEY,
  SCHEDULE_SESSIONS_QUERY_KEY,
  scheduleSessionsApi,
} from '../../api/schedule-sessions';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { fieldWithProblem, formOf, requestOf, type SessionForm } from './session-form';

// Full catalog keys as literals, so the unused-key check can see them.
const PROBLEM_KEYS = {
  practitionerId: 'schedules.problem.practitionerId',
  sessionDate: 'schedules.problem.sessionDate',
  startTime: 'schedules.problem.startTime',
  endTime: 'schedules.problem.endTime',
  capacity: 'schedules.problem.capacity',
} as const;

export function SessionDialog({
  sessionDate,
  onOpenChange,
}: {
  /** The date the form starts on: the first day of the week shown. */
  sessionDate: string;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => formOf(sessionDate));
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const practitioners = useQuery({
    queryKey: SCHEDULE_PRACTITIONERS_QUERY_KEY,
    queryFn: scheduleSessionsApi.practitionerChoices,
  });
  const request = requestOf(form);

  const save = useMutation({
    mutationFn: () => {
      if (!request) throw new Error('The form is incomplete');
      return scheduleSessionsApi.create(request, idempotencyKey);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SCHEDULE_SESSIONS_QUERY_KEY });
      toast.show({ title: t('schedules.added'), tone: 'success' });
      onOpenChange(false);
    },
    // A refused request created nothing; a corrected one is a new request with a new key.
    onError: () => setIdempotencyKey(crypto.randomUUID()),
  });
  const refusedField = fieldWithProblem(save.error);
  const problemOf = (field: keyof SessionForm) =>
    refusedField === field ? t(PROBLEM_KEYS[field]) : undefined;
  const update = (patch: Partial<SessionForm>) => {
    save.reset();
    setForm((current) => ({ ...current, ...patch }));
  };
  const endBeforeStart =
    form.startTime !== '' && form.endTime !== '' && form.endTime <= form.startTime;

  const options = [
    { value: '', label: t('schedules.choosePractitioner') },
    ...(practitioners.data ?? []).map((row) => ({
      value: row.practitionerId,
      label: [row.nameEn ?? row.nameBn ?? '', row.specialty].filter(Boolean).join(', '),
    })),
  ];

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={t('schedules.addTitle')}
      description={t('schedules.formHint')}
      footer={
        <Button loading={save.isPending} disabled={!request} onClick={() => save.mutate()}>
          {t('schedules.add')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {practitioners.error ? (
          <Alert tone="danger">{errorMessage(practitioners.error)}</Alert>
        ) : null}
        {save.error && !refusedField ? (
          <Alert tone="danger">{errorMessage(save.error)}</Alert>
        ) : null}
        <Field label={t('schedules.practitioner')} error={problemOf('practitionerId')} required>
          {({ id, ...aria }) => (
            <Select
              id={id}
              options={options}
              value={form.practitionerId}
              onChange={(event) => update({ practitionerId: event.target.value })}
              {...aria}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('schedules.sessionDate')} error={problemOf('sessionDate')} required>
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                type="date"
                value={form.sessionDate}
                onChange={(event) => update({ sessionDate: event.target.value })}
                {...aria}
              />
            )}
          </Field>
          <Field label={t('schedules.startTime')} error={problemOf('startTime')} required>
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                type="time"
                value={form.startTime}
                onChange={(event) => update({ startTime: event.target.value })}
                {...aria}
              />
            )}
          </Field>
          <Field
            label={t('schedules.endTime')}
            error={endBeforeStart ? t('schedules.endBeforeStart') : problemOf('endTime')}
            required
          >
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                type="time"
                value={form.endTime}
                onChange={(event) => update({ endTime: event.target.value })}
                {...aria}
              />
            )}
          </Field>
        </div>
        <Field
          label={t('schedules.capacity')}
          hint={t('schedules.capacityHint')}
          error={problemOf('capacity')}
          required
        >
          {({ id, ...aria }) => (
            <TextInput
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              step={1}
              value={form.capacity}
              onChange={(event) => update({ capacity: event.target.value })}
              {...aria}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
