'use client';
// The prescription draft (T-CLI-03; FR-CLI-004..006; UC-CLI-01 steps 4 and 5, R1; UC-CLI-02;
// Q-067 interim). The doctor finds medicines in the catalogue and writes each line; the draft
// autosaves two seconds after the last change, one save at a time with the prescription's version
// (SP-03), so a crashed browser loses nothing. Sign saves what is pending, then signs. An unsigned
// draft can be discarded; an amendment's draft shows its reason.
import type { Prescription, PrescriptionLineInput, PrescribingTermChoices } from '@hms/contracts';
import { formatTimeOfDay, type Locale } from '@hms/i18n';
import { Alert, Button, useToast } from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/errors';
import { prescriptionQueryKey, prescriptionsApi } from '../../api/prescriptions';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { LineFields } from './line-fields';
import { MedicinePicker } from './medicine-picker';
import {
  linesFormOf,
  linesOf,
  newLine,
  readyToSign,
  sameLines,
  type LineForm,
} from './prescription-form';

const AUTOSAVE_MS = 2000;

export function PrescriptionEditor({
  consultationId,
  prescription,
  terms,
}: {
  consultationId: string;
  prescription: Prescription;
  terms: PrescribingTermChoices;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<LineForm[]>(() => linesFormOf(prescription.draft));
  const [savedAt, setSavedAt] = useState(prescription.draftSavedAt);
  // What the server holds and at which version: the next command is sent with these.
  const version = useRef(prescription.version);
  const saved = useRef(prescription.draft);
  // One save at a time, so each carries the version the previous one returned.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<number | undefined>(undefined);
  const signKey = useRef(new Map<number, string>());

  const keep = (next: Prescription) => {
    version.current = next.version;
    saved.current = next.draft;
    setSavedAt(next.draftSavedAt);
    queryClient.setQueryData(prescriptionQueryKey(consultationId), next);
  };

  const save = useMutation({
    mutationFn: (inputs: PrescriptionLineInput[]) =>
      prescriptionsApi.saveDraft(
        consultationId,
        { lines: inputs, expectedVersion: version.current },
        crypto.randomUUID(),
      ),
    onSuccess: keep,
  });

  /** Saves the lines if they differ from what the server holds; resolves when saved. */
  const flush = () => {
    window.clearTimeout(timer.current);
    queue.current = queue.current.then(async () => {
      const inputs = linesOf(lines);
      // Nothing written yet: no empty prescription is created.
      if (!inputs || (saved.current === null && inputs.length === 0)) return;
      if (sameLines(inputs, saved.current)) return;
      await save.mutateAsync(inputs);
    });
    return queue.current;
  };

  // The debounce: every change re-arms the timer, and flush reads that render's lines.
  useEffect(() => {
    timer.current = window.setTimeout(() => {
      void flush().catch(() => undefined);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer.current);
  }, [lines]);

  const sign = useMutation({
    mutationFn: async () => {
      await flush();
      const key = signKey.current.get(version.current) ?? crypto.randomUUID();
      signKey.current.set(version.current, key);
      return prescriptionsApi.sign(consultationId, { expectedVersion: version.current }, key);
    },
    onSuccess: (next) => {
      keep(next);
      toast.show({ title: t('prescription.signed'), tone: 'success' });
    },
  });

  const discard = useMutation({
    mutationFn: async () => {
      window.clearTimeout(timer.current);
      await queue.current.catch(() => undefined);
      return prescriptionsApi.discard(
        consultationId,
        { expectedVersion: version.current },
        crypto.randomUUID(),
      );
    },
    onSuccess: (next) => {
      keep(next);
      setLines(linesFormOf(next.draft));
      toast.show({ title: t('prescription.discarded'), tone: 'success' });
    },
  });

  const failure = save.error ?? sign.error ?? discard.error;
  const stale = failure instanceof ApiError && failure.code === 'STALE_RECORD';
  const hasDraft = prescription.status === 'DRAFT' || saved.current !== null;
  const ready = readyToSign(lines);
  const change = (lineId: string, patch: Partial<LineForm>) =>
    setLines((current) =>
      current.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)),
    );
  const reload = () =>
    void queryClient.invalidateQueries({ queryKey: prescriptionQueryKey(consultationId) });

  let saveState: string | null = null;
  if (save.isPending) saveState = t('prescription.saving');
  else if (savedAt)
    saveState = t('prescription.savedAt', { time: formatTimeOfDay(savedAt, locale) });

  return (
    <section aria-labelledby="prescription-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="prescription-title" className="text-lg font-semibold">
          {t('prescription.title')}
        </h2>
        <span className="text-sm text-text-muted tabular-nums" role="status">
          {saveState}
        </span>
      </div>
      {prescription.amendReason ? (
        <Alert tone="info">
          {t('prescription.amending', {
            version: prescription.versions[0]?.versionNo ?? 1,
            reason: prescription.amendReason,
          })}
        </Alert>
      ) : null}
      {stale ? (
        <div className="flex flex-col items-start gap-2">
          <Alert tone="warning">{t('prescription.staleNotice')}</Alert>
          <Button variant="secondary" onClick={reload}>
            {t('prescription.reload')}
          </Button>
        </div>
      ) : null}
      {failure && !stale ? <Alert tone="danger">{errorMessage(failure)}</Alert> : null}

      <MedicinePicker
        onPick={(medicine) =>
          setLines((current) => [...current, newLine(medicine, crypto.randomUUID())])
        }
      />
      {lines.length === 0 ? (
        <p className="text-sm text-text-muted">{t('prescription.noLines')}</p>
      ) : null}
      {lines.map((line, index) => (
        <LineFields
          key={line.lineId}
          line={line}
          index={index}
          terms={terms}
          onChange={(patch) => change(line.lineId, patch)}
          onRemove={() =>
            setLines((current) => current.filter((row) => row.lineId !== line.lineId))
          }
        />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button loading={sign.isPending} disabled={!ready || stale} onClick={() => sign.mutate()}>
          {t('prescription.sign')}
        </Button>
        {hasDraft ? (
          <Button variant="secondary" loading={discard.isPending} onClick={() => discard.mutate()}>
            {prescription.amendReason
              ? t('prescription.discardAmendment')
              : t('prescription.discard')}
          </Button>
        ) : null}
        {ready ? null : (
          <span className="text-sm text-text-muted">{t('prescription.signNeedsLines')}</span>
        )}
      </div>
    </section>
  );
}
