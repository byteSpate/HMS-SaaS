'use client';
// SCR-08 doctor worklist (T-CLI-01; FR-CLI-002; UC-CLI-01 step 1; W-03; F sections 4.3, 7.3, 8;
// ADR-015). Today's sessions of the signed-in doctor with their patients. The list polls every
// 20 seconds while the tab is visible, with the last ETag (a 304 keeps it), refreshes on focus and
// after a start, and shows when it was last checked. Enter opens the next WAITING patient: focus
// starts on "Open next patient", and Enter anywhere outside a control does the same. Patients
// becoming WAITING are announced. clinical.consultation.record; the API enforces it and
// that the patient is the doctor's.
import type { WorklistEntry } from '@hms/contracts';
import { formatDate, formatTimeOfDay, type Locale } from '@hms/i18n';
import { Alert, announce, Button, PageLayout, Skeleton } from '@hms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../src/api/errors';
import { WORKLIST_QUERY_KEY, worklistApi, type PolledWorklist } from '../../../src/api/worklist';
import { practitionerName } from '../../../src/components/practitioners/practitioner-form';
import { newlyWaiting, nextWaiting } from '../../../src/components/worklist/worklist-rules';
import { WorklistSessionTable } from '../../../src/components/worklist/worklist-session';
import { useApiErrorMessage } from '../../../src/i18n/use-api-error-message';

/** ADR-015: 15 to 30 seconds while visible. */
const POLL_MS = 20_000;

/** Enter outside a control opens the next patient; inside one it keeps its own meaning. */
const isControl = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  target.closest('button, a, input, select, textarea, [role="dialog"]') !== null;

export default function WorklistPage() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const keys = useRef(new Map<string, string>());
  const [now, setNow] = useState(() => new Date());

  const polled = useQuery({
    queryKey: WORKLIST_QUERY_KEY,
    queryFn: () => worklistApi.today(queryClient.getQueryData<PolledWorklist>(WORKLIST_QUERY_KEY)),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const worklist = polled.data?.worklist;

  // F 7.3: "n new patients waiting", against the list shown before this poll.
  const shown = useRef(worklist);
  useEffect(() => {
    if (!worklist || worklist === shown.current) return;
    const count = newlyWaiting(shown.current, worklist);
    if (count > 0) announce(t('worklist.newWaiting', { count }));
    shown.current = worklist;
  }, [worklist, t]);

  // Minutes waited move on between polls.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const start = useMutation({
    mutationFn: (entry: WorklistEntry) => {
      const visitId = entry.visitId ?? '';
      // One key per patient row and version: a retry after a lost answer is the same start.
      const slot = `${visitId}:${entry.visitVersion}`;
      const key = keys.current.get(slot) ?? crypto.randomUUID();
      keys.current.set(slot, key);
      return worklistApi.start(visitId, { expectedVersion: entry.visitVersion ?? 0 }, key);
    },
    onSuccess: (consultation) => {
      void queryClient.invalidateQueries({ queryKey: WORKLIST_QUERY_KEY });
      router.push(`/consultations/${consultation.consultationId}`);
    },
    onError: (error) => {
      // A refusal saved nothing: the next try gets a new key, on the reloaded list.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        keys.current.clear();
        void queryClient.invalidateQueries({ queryKey: WORKLIST_QUERY_KEY });
      }
    },
  });
  const startingId = start.isPending ? (start.variables.visitId ?? null) : null;

  const next = worklist ? nextWaiting(worklist) : null;
  // F 4.3: once, when the first waiting patient shows, so polls never move the doctor's focus.
  const openNextRef = useRef<HTMLButtonElement>(null);
  const focusedOnce = useRef(false);
  useEffect(() => {
    if (!next || focusedOnce.current) return;
    openNextRef.current?.focus();
    focusedOnce.current = true;
  }, [next]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || isControl(event.target) || !next || start.isPending) return;
      event.preventDefault();
      start.mutate(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, start]);

  const description = worklist
    ? [
        formatDate(worklist.date, locale),
        worklist.practitioner ? practitionerName(worklist.practitioner) : null,
      ]
        .filter(Boolean)
        .join(' - ')
    : undefined;

  return (
    <PageLayout
      title={t('worklist.title')}
      description={description}
      actions={
        <>
          {polled.data ? (
            <span className="text-sm text-text-muted tabular-nums">
              {t('worklist.updated', { time: formatTimeOfDay(polled.data.checkedAt, locale) })}
            </span>
          ) : null}
          <Button
            variant="secondary"
            loading={polled.isFetching}
            onClick={() => void polled.refetch()}
          >
            {t('worklist.refresh')}
          </Button>
          {next ? (
            <Button ref={openNextRef} loading={start.isPending} onClick={() => start.mutate(next)}>
              {t('worklist.openNext')}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {polled.error ? <Alert tone="danger">{errorMessage(polled.error)}</Alert> : null}
        {start.error ? <Alert tone="danger">{errorMessage(start.error)}</Alert> : null}
        {polled.isPending ? <Skeleton className="h-40" /> : null}
        {worklist && !worklist.practitioner ? (
          <Alert tone="warning">{t('worklist.notLinked')}</Alert>
        ) : null}
        {worklist?.practitioner && worklist.sessions.length === 0 ? (
          <p className="text-sm text-text-muted">{t('worklist.noSessions')}</p>
        ) : null}
        {worklist?.sessions.map((session) => (
          <WorklistSessionTable
            key={session.sessionId}
            session={session}
            now={now}
            startingId={startingId}
            onStart={(entry) => start.mutate(entry)}
          />
        ))}
      </div>
    </PageLayout>
  );
}
