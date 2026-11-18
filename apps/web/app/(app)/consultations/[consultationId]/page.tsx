'use client';
// A consultation the doctor started from the worklist (T-CLI-01, T-CLI-02, T-CLI-03; UC-CLI-01;
// W-03): the patient, the consultation's status and start time, the consultation note and the
// prescription (draft, sign, amend, print), and the visit's orders (T-ORD-01). Only the doctor's
// own consultation reads; another is NOT_FOUND (clinical.consultation.record).
import { formatDateTime, type Locale } from '@hms/i18n';
import { Alert, PageLayout, Skeleton, StatusBadge } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { consultationQueryKey, worklistApi } from '../../../../src/api/worklist';
import { NotePanel } from '../../../../src/components/consultation/note-panel';
import { ConsultationOrders } from '../../../../src/components/orders/consultation-orders';
import { PrescriptionPanel } from '../../../../src/components/prescription/prescription-panel';
import { displayName } from '../../../../src/components/patients/patient-text';
import { WORKLIST_STATUS } from '../../../../src/components/worklist/worklist-rules';
import { useApiErrorMessage } from '../../../../src/i18n/use-api-error-message';
import { useCachedSession } from '../../../../src/session/use-session';

export default function ConsultationPage() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const errorMessage = useApiErrorMessage();
  const { consultationId } = useParams<{ consultationId: string }>();
  const permissions = useCachedSession()?.permissions ?? [];
  const canPrescribe = permissions.includes('clinical.prescription.create');
  const canOrder = permissions.includes('order.service.create');
  const consultation = useQuery({
    queryKey: consultationQueryKey(consultationId),
    queryFn: () => worklistApi.consultation(consultationId),
  });
  const data = consultation.data;

  return (
    <PageLayout
      title={data ? displayName(data.patient) : t('consultation.title')}
      description={data ? data.patient.mrn : undefined}
      actions={
        <Link className="font-medium text-primary underline" href="/worklist">
          {t('consultation.back')}
        </Link>
      }
    >
      {consultation.error ? <Alert tone="danger">{errorMessage(consultation.error)}</Alert> : null}
      {consultation.isPending ? <Skeleton className="h-24" /> : null}
      {data ? (
        <div className="flex flex-col gap-6">
          <p className="flex flex-wrap items-center gap-3">
            <StatusBadge
              status={WORKLIST_STATUS[data.status].badge}
              label={t(WORKLIST_STATUS[data.status].labelKey)}
            />
            <span className="text-text-muted">
              {t('consultation.startedAt', { time: formatDateTime(data.startedAt, locale) })}
            </span>
          </p>
          <NotePanel consultationId={consultationId} />
          {canOrder ? <ConsultationOrders consultationId={consultationId} /> : null}
          {canPrescribe ? <PrescriptionPanel consultationId={consultationId} /> : null}
        </div>
      ) : null}
    </PageLayout>
  );
}
