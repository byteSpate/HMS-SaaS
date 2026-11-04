'use client';
// SCR-02 new registration (T-PAT-01; UC-PAT-01; FR-PAT-001, -005, -006, -011; C-034; F section 3 rule 6).
// While the receptionist types, possible existing patients are listed with why they match. When
// any exist, "Register" needs an explicit confirmation that none is the same person; the API
// checks the same rule and the list again. One Idempotency-Key per dialog, so a retry after a
// timeout returns the patient already created (SP-08).
import {
  DUPLICATE_CANDIDATES_PRESENT,
  patientSexes,
  type DuplicateCandidatesRequest,
  type PatientSex,
  type RegisterPatientRequest,
} from '@hms/contracts';
import { Alert, Button, Checkbox, Dialog, Field, Select, TextInput, useToast } from '@hms/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '../../api/errors';
import { patientsApi } from '../../api/patients';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { displayName, usePatientText } from './patient-text';
import { useDebouncedValue } from './use-debounced-value';

interface RegistrationForm {
  nameBn: string;
  nameEn: string;
  sex: PatientSex | '';
  birthDate: string;
  age: string;
  phone: string;
  noPhone: boolean;
  nid: string;
  address: string;
}

const EMPTY: RegistrationForm = {
  nameBn: '',
  nameEn: '',
  sex: '',
  birthDate: '',
  age: '',
  phone: '',
  noPhone: false,
  nid: '',
  address: '',
};

const AGE = /^\d{1,3}$/;

/** The identity, once it is complete enough to look for duplicates (UC-PAT-01 step 3). */
function lookupOf(form: RegistrationForm): DuplicateCandidatesRequest | null {
  const nameBn = form.nameBn.trim();
  const nameEn = form.nameEn.trim();
  const hasBirth = form.birthDate !== '' || AGE.test(form.age.trim());
  if ((!nameBn && !nameEn) || form.sex === '' || !hasBirth) return null;
  return {
    ...(nameBn ? { nameBn } : {}),
    ...(nameEn ? { nameEn } : {}),
    sex: form.sex,
    ...(form.birthDate
      ? { birthDate: form.birthDate }
      : { reportedAgeYears: Number(form.age.trim()) }),
    phone: form.noPhone ? null : form.phone.trim() || null,
    ...(form.nid.trim() ? { nid: form.nid.trim() } : {}),
  };
}

export function RegistrationDialog({
  onOpenChange,
  onRegistered,
}: {
  onOpenChange: (open: boolean) => void;
  onRegistered: (patientId: string) => void;
}) {
  const t = useTranslations();
  const toast = useToast();
  const text = usePatientText();
  const errorMessage = useApiErrorMessage();
  const [form, setForm] = useState(EMPTY);
  const [confirmed, setConfirmed] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const update = (patch: Partial<RegistrationForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setConfirmed(false);
  };

  const lookup = lookupOf(form);
  const probe = useDebouncedValue(lookup ? JSON.stringify(lookup) : null, 400);
  const candidates = useQuery({
    queryKey: ['patients', 'candidates', probe],
    queryFn: () => patientsApi.candidates(JSON.parse(probe ?? '{}') as DuplicateCandidatesRequest),
    enabled: probe !== null,
    retry: false,
  });
  const found = candidates.data ?? [];

  const register = useMutation({
    mutationFn: () => {
      if (!lookup) throw new Error('The form is not complete');
      const request: RegisterPatientRequest = {
        ...lookup,
        // C-034: the mobile number is required unless the patient has none.
        phone: form.noPhone ? null : form.phone.trim(),
        ...(form.address.trim() ? { addressText: form.address.trim() } : {}),
        confirmNewDespiteCandidates: found.length > 0 && confirmed,
        shownCandidateIds: found.map((candidate) => candidate.patientId),
      };
      return patientsApi.register(request, idempotencyKey);
    },
    onSuccess: (patient) => {
      toast.show({ title: t('patients.registered', { mrn: patient.mrn }), tone: 'success' });
      onRegistered(patient.patientId);
    },
    onError: (error) => {
      // Someone matching was registered meanwhile: show the new list before asking again.
      if (error instanceof ApiError && error.problem?.reason === DUPLICATE_CANDIDATES_PRESENT) {
        void candidates.refetch();
      }
    },
  });

  const phoneGiven = form.noPhone || form.phone.trim() !== '';
  const reviewed = found.length === 0 || confirmed;
  const canRegister = lookup !== null && phoneGiven && reviewed && !candidates.isFetching;
  const sexOptions = [
    { value: '', label: t('patients.sex') },
    ...patientSexes.map((sex) => ({ value: sex, label: text.sex(sex) })),
  ];

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={t('patients.newRegistration')}
      footer={
        <Button
          loading={register.isPending}
          disabled={!canRegister}
          onClick={() => register.mutate()}
        >
          {t('patients.register')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {register.error ? <Alert tone="danger">{errorMessage(register.error)}</Alert> : null}
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
          <Field label={t('patients.sex')} required>
            {({ id, required, ...aria }) => (
              <Select
                id={id}
                required={required}
                options={sexOptions}
                value={form.sex}
                onChange={(event) => update({ sex: event.target.value as PatientSex | '' })}
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
                disabled={form.birthDate !== ''}
                onChange={(event) => update({ age: event.target.value })}
                {...aria}
              />
            )}
          </Field>
          <div className="flex flex-col gap-2">
            <Field label={t('patients.phone')} required={!form.noPhone}>
              {({ id, required, ...aria }) => (
                <TextInput
                  id={id}
                  type="tel"
                  inputMode="tel"
                  required={required}
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
          <Field label={t('patients.nid')}>
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
              onChange={(event) =>
                setForm((current) => ({ ...current, address: event.target.value }))
              }
              {...aria}
            />
          )}
        </Field>

        {found.length > 0 ? (
          <section
            aria-label={t('patients.candidatesTitle', { count: text.digits(found.length) })}
            className="rounded-panel bg-status-attention-bg p-4 text-status-attention-text"
          >
            <div className="flex flex-col gap-3">
              <p className="font-medium">
                {t('patients.candidatesTitle', { count: text.digits(found.length) })}
              </p>
              <p>{t('patients.candidatesHint')}</p>
              <ul className="flex flex-col gap-2">
                {found.map((candidate) => (
                  <li
                    key={candidate.patientId}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      <span className="font-medium">{displayName(candidate)}</span> {candidate.mrn}{' '}
                      . {text.sex(candidate.sex)} . {text.reasons(candidate.reasons)}
                    </span>
                    <Link className="underline" href={`/patients/${candidate.patientId}`}>
                      {t('patients.useThis')}
                    </Link>
                  </li>
                ))}
              </ul>
              <Checkbox
                label={t('patients.confirmNew')}
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
            </div>
          </section>
        ) : null}
        {candidates.error ? <Alert tone="danger">{errorMessage(candidates.error)}</Alert> : null}
      </div>
    </Dialog>
  );
}
