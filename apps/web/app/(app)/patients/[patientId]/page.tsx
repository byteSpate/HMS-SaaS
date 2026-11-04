'use client';
// SCR-03 patient record (T-PAT-03, T-PAT-04; FR-PAT-007, FR-PAT-008, FR-PAT-010): the banner fields
// and identity details. The NID stays masked; patient.sensitive.view may show it, and the API
// audits every reveal (FR-AUD-003). patient.identity.edit may correct the details with a reason.
import type { PatientDetail } from '@hms/contracts';
import { formatDate, type Locale } from '@hms/i18n';
import { Alert, Button, PageLayout, Skeleton } from '@hms/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { patientQueryKeys, patientsApi } from '../../../../src/api/patients';
import { CorrectionDialog } from '../../../../src/components/patients/correction-dialog';
import { displayName, usePatientText } from '../../../../src/components/patients/patient-text';
import { useApiErrorMessage } from '../../../../src/i18n/use-api-error-message';
import { useCachedSession } from '../../../../src/session/use-session';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** The exact date, or the age as it was given and when (FR-PAT-006); never an invented date. */
function BirthText({ patient }: { patient: PatientDetail }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const text = usePatientText();
  if (patient.birthDate) return <>{formatDate(patient.birthDate, locale)}</>;
  if (patient.reportedAgeYears === null || !patient.reportedAgeOn) {
    return <>{t('patients.notRecorded')}</>;
  }
  return (
    <>
      {t('patients.reportedAge', {
        years: text.digits(patient.reportedAgeYears),
        date: formatDate(patient.reportedAgeOn, locale),
      })}
    </>
  );
}

/** Masked by default; the full number only on request, and the API audits each reveal. */
function NidValue({ patient, canReveal }: { patient: PatientDetail; canReveal: boolean }) {
  const t = useTranslations();
  const text = usePatientText();
  const errorMessage = useApiErrorMessage();
  const [nid, setNid] = useState<string | null>(null);
  const reveal = useMutation({
    mutationFn: () => patientsApi.revealNid(patient.patientId),
    onSuccess: setNid,
  });
  const revealable = patient.nidLast4 !== null && canReveal;
  let control: ReactNode = null;
  if (revealable && nid) {
    control = (
      <Button variant="ghost" onClick={() => setNid(null)}>
        {t('patients.hideNid')}
      </Button>
    );
  } else if (revealable) {
    control = (
      <Button variant="ghost" loading={reveal.isPending} onClick={() => reveal.mutate()}>
        {t('patients.showNid')}
      </Button>
    );
  }
  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        <span>{nid ? text.digits(nid) : text.nid(patient.nidLast4)}</span>
        {control}
      </span>
      {nid ? (
        <span className="font-normal text-text-muted">{t('patients.nidAuditNotice')}</span>
      ) : null}
      {reveal.error ? <Alert tone="danger">{errorMessage(reveal.error)}</Alert> : null}
    </span>
  );
}

function PatientDetails({ patient, canReveal }: { patient: PatientDetail; canReveal: boolean }) {
  const t = useTranslations();
  const text = usePatientText();
  return (
    <div className="flex flex-col gap-4">
      {patient.identityStatus === 'TEMPORARY' ? (
        <Alert tone="warning">{t('patients.temporaryId')}</Alert>
      ) : null}
      <dl className="grid max-w-3xl gap-4 rounded-panel border border-border bg-surface p-5 sm:grid-cols-2">
        <Detail label={t('patients.columnSexAge')}>
          {text.sex(patient.sex)}, {text.age(patient.ageYears, patient.ageEstimated)}
        </Detail>
        <Detail label={t('patients.birthDate')}>
          <BirthText patient={patient} />
        </Detail>
        <Detail label={t('patients.phone')}>
          {patient.phone ? text.digits(patient.phone) : t('patients.notRecorded')}
        </Detail>
        <Detail label={t('patients.address')}>
          {patient.addressText ?? t('patients.notRecorded')}
        </Detail>
        <Detail label={t('patients.nidLabel')}>
          <NidValue patient={patient} canReveal={canReveal} />
        </Detail>
      </dl>
    </div>
  );
}

export default function PatientPage() {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const session = useCachedSession();
  const { patientId } = useParams<{ patientId: string }>();
  const patient = useQuery({
    queryKey: patientQueryKeys.detail(patientId),
    queryFn: () => patientsApi.detail(patientId),
  });
  const [correcting, setCorrecting] = useState(false);
  const can = (code: string) => session?.permissions.includes(code) ?? false;
  const data = patient.data;

  return (
    <PageLayout
      title={data ? displayName(data) : t('patients.detailTitle')}
      description={data?.mrn}
      actions={
        <div className="flex gap-2">
          <Link className="underline" href="/patients">
            {t('patients.backToSearch')}
          </Link>
          {data && can('patient.identity.edit') ? (
            <Button onClick={() => setCorrecting(true)}>{t('patients.correct')}</Button>
          ) : null}
        </div>
      }
    >
      {patient.error ? <Alert tone="danger">{errorMessage(patient.error)}</Alert> : null}
      {patient.isPending ? <Skeleton className="h-40" /> : null}
      {data ? <PatientDetails patient={data} canReveal={can('patient.sensitive.view')} /> : null}
      {correcting && data ? <CorrectionDialog patient={data} onOpenChange={setCorrecting} /> : null}
    </PageLayout>
  );
}
