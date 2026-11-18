'use client';
// The prescription part of the consultation screen (T-CLI-03; FR-CLI-004..006; UC-CLI-01 step 4;
// UC-CLI-02): reads the prescription and the hospital's lists, then shows the draft editor while
// nothing is signed or an amendment is open, and the signed view otherwise. The editor is keyed by
// the signed versions and the amendment, so signing or amending starts it fresh from the server.
// Shown only with clinical.prescription.create; the API enforces it.
import { Alert, Skeleton } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { prescribingApi } from '../../api/medicines';
import {
  PRESCRIBING_TERM_CHOICES_KEY,
  prescriptionQueryKey,
  prescriptionsApi,
} from '../../api/prescriptions';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { useCachedSession } from '../../session/use-session';
import { PrescriptionEditor } from './prescription-editor';
import { PrescriptionView } from './prescription-view';

export function PrescriptionPanel({ consultationId }: { consultationId: string }) {
  const errorMessage = useApiErrorMessage();
  const permissions = useCachedSession()?.permissions ?? [];
  const prescription = useQuery({
    queryKey: prescriptionQueryKey(consultationId),
    queryFn: () => prescriptionsApi.read(consultationId),
  });
  const terms = useQuery({
    queryKey: PRESCRIBING_TERM_CHOICES_KEY,
    queryFn: prescribingApi.terms,
    staleTime: 5 * 60_000,
  });

  const failure = prescription.error ?? terms.error;
  if (failure) return <Alert tone="danger">{errorMessage(failure)}</Alert>;
  if (!prescription.data || !terms.data) return <Skeleton className="h-48" />;
  if (prescription.data.status === 'SIGNED') {
    return (
      <PrescriptionView
        consultationId={consultationId}
        prescription={prescription.data}
        canAmend={permissions.includes('clinical.document.amend')}
      />
    );
  }
  return (
    <PrescriptionEditor
      key={`${prescription.data.versions.length}:${prescription.data.amendReason ?? ''}`}
      consultationId={consultationId}
      prescription={prescription.data}
      terms={terms.data}
    />
  );
}
