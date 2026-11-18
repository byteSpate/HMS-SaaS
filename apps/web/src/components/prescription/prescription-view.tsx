'use client';
// The signed prescription (T-CLI-03; FR-CLI-004..006; UC-CLI-02; FPR-06). The latest version in
// full, marked "Amended" from v2 on with its reason, earlier versions still readable, and Print
// in the chosen language (FR-CLI-005). Amend needs clinical.document.amend.
import type { Prescription, PrescriptionLine, SignedPrescriptionVersion } from '@hms/contracts';
import { formatDateTime, toLocaleDigits, type Locale } from '@hms/i18n';
import { Button, StatusBadge } from '@hms/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { prescriptionQueryKey, prescriptionsApi } from '../../api/prescriptions';
import { AmendDialog } from '../consultation/amend-dialog';
import { medicineLabel, termLabel } from './prescription-form';
import { FULFILMENT_LABEL } from './prescription-labels';
import { PrintPrescription } from './print-prescription';

function LineView({ line, index }: { line: PrescriptionLine; index: number }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const how = [
    line.dose,
    line.route && termLabel(line.route, locale),
    line.frequency && termLabel(line.frequency, locale),
    line.duration && termLabel(line.duration, locale),
  ]
    .filter(Boolean)
    .join(' - ');
  const instructions =
    locale === 'bn-BD'
      ? (line.instructionsBn ?? line.instructionsEn)
      : (line.instructionsEn ?? line.instructionsBn);
  return (
    <li className="flex flex-col gap-1 border-b border-border py-2 last:border-b-0">
      <p>
        <span className="font-medium">
          {toLocaleDigits(String(index + 1), locale)}. {medicineLabel(line.medicine)}
        </span>
        <span className="ms-2 text-sm text-text-muted">{line.medicine.genericName}</span>
      </p>
      {how ? <p>{how}</p> : null}
      {instructions ? <p className="text-sm">{instructions}</p> : null}
      <p className="text-sm text-text-muted">
        {t(FULFILMENT_LABEL[line.fulfilment])}
        {line.quantity === null
          ? ''
          : ` - ${t('prescription.quantityShown', { quantity: toLocaleDigits(String(line.quantity), locale) })}`}
        {line.patientNote ? ` - ${line.patientNote}` : ''}
      </p>
    </li>
  );
}

function VersionBlock({ version }: { version: SignedPrescriptionVersion }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
        <span className="font-medium text-text">
          {t('prescription.versionTitle', {
            version: toLocaleDigits(String(version.versionNo), locale),
          })}
        </span>
        {version.versionNo > 1 ? (
          <StatusBadge size="sm" status="review" label={t('prescription.amended')} />
        ) : null}
        <span>
          {t('prescription.signedBy', {
            name: version.signedBy,
            time: formatDateTime(version.signedAt, locale),
          })}
        </span>
        {version.amendReason ? (
          <span>{t('prescription.amendReasonShown', { reason: version.amendReason })}</span>
        ) : null}
      </p>
      <ol className="flex flex-col">
        {version.content.lines.map((line, index) => (
          <LineView key={line.lineId} line={line} index={index} />
        ))}
      </ol>
    </div>
  );
}

export function PrescriptionView({
  consultationId,
  prescription,
  canAmend,
}: {
  consultationId: string;
  prescription: Prescription;
  canAmend: boolean;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [amending, setAmending] = useState(false);
  const [latest, ...earlier] = prescription.versions;
  if (!latest) return null;

  return (
    <section aria-labelledby="prescription-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="prescription-title" className="text-lg font-semibold">
          {t('prescription.title')}
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <PrintPrescription consultationId={consultationId} />
          {canAmend ? (
            <Button variant="secondary" onClick={() => setAmending(true)}>
              {t('prescription.amend')}
            </Button>
          ) : null}
        </div>
      </div>
      <VersionBlock version={latest} />
      {earlier.length > 0 ? (
        <details className="rounded-panel border border-border p-3">
          <summary className="cursor-pointer font-medium">
            {t('prescription.earlierVersions')}
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            {earlier.map((version) => (
              <VersionBlock key={version.versionNo} version={version} />
            ))}
          </div>
        </details>
      ) : null}
      {amending ? (
        <AmendDialog
          texts={{
            title: t('prescription.amendTitle'),
            body: t('prescription.amendBody'),
            reason: t('prescription.amendReason'),
            submit: t('prescription.amendSubmit'),
          }}
          onAmend={async (reason, key) => {
            const next = await prescriptionsApi.amend(
              consultationId,
              { reason, expectedVersion: prescription.version },
              key,
            );
            queryClient.setQueryData(prescriptionQueryKey(consultationId), next);
          }}
          onOpenChange={setAmending}
        />
      ) : null}
    </section>
  );
}
