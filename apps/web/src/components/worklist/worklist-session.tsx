'use client';
// One session of the doctor worklist as a table (T-CLI-01; SCR-08; W-03; FR-CLI-002; F sections
// 4.3 and 6): serial number, patient, status as word, icon and color, minutes waited, and the one
// action the status allows. WAITING opens the consultation; WAITING_PAYMENT is greyed with its
// reason and cannot be opened (C-011); IN_CONSULTATION continues it.
import type { WorklistEntry, WorklistSession } from '@hms/contracts';
import { toLocaleDigits, type Locale } from '@hms/i18n';
import { Button, StatusBadge } from '@hms/ui';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { CELL, HEAD_CELL, ROW, ROW_TITLE, TABLE, TABLE_FRAME } from '../admin/admin-table';
import { displayName } from '../patients/patient-text';
import { canStart, waitingMinutes, WORKLIST_STATUS } from './worklist-rules';

function EntryAction({
  entry,
  starting,
  onStart,
}: {
  entry: WorklistEntry;
  starting: boolean;
  onStart: (entry: WorklistEntry) => void;
}) {
  const t = useTranslations();
  if (canStart(entry)) {
    return (
      <Button loading={starting} onClick={() => onStart(entry)}>
        {t('worklist.start')}
      </Button>
    );
  }
  if (entry.status === 'WAITING_PAYMENT') {
    return <span className="text-text-muted">{t('worklist.cannotOpen')}</span>;
  }
  if (entry.status === 'IN_CONSULTATION' && entry.consultationId) {
    return (
      <Link
        className="font-medium text-primary underline"
        href={`/consultations/${entry.consultationId}`}
      >
        {t('worklist.continue')}
      </Link>
    );
  }
  return null;
}

export function WorklistSessionTable({
  session,
  now,
  startingId,
  onStart,
}: {
  session: WorklistSession;
  now: Date;
  /** The visit being started, so only its button shows the spinner. */
  startingId: string | null;
  onStart: (entry: WorklistEntry) => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const digits = (value: number | string) => toLocaleDigits(String(value), locale);
  const titleId = `worklist-session-${session.sessionId}`;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-base font-semibold">
        {t('worklist.sessionTitle', {
          start: digits(session.startTime),
          end: digits(session.endTime),
        })}
      </h2>
      {session.entries.length === 0 ? (
        <p className="text-sm text-text-muted">{t('worklist.sessionEmpty')}</p>
      ) : (
        <div className={TABLE_FRAME}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={HEAD_CELL}>
                  {t('worklist.columnSerial')}
                </th>
                <th scope="col" className={HEAD_CELL}>
                  {t('worklist.columnPatient')}
                </th>
                <th scope="col" className={HEAD_CELL}>
                  {t('worklist.columnStatus')}
                </th>
                <th scope="col" className={HEAD_CELL}>
                  {t('worklist.columnWaiting')}
                </th>
                <th scope="col" className={HEAD_CELL}>
                  <span className="sr-only">{t('worklist.columnAction')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {session.entries.map((entry) => {
                const { labelKey, badge } = WORKLIST_STATUS[entry.status];
                const minutes = waitingMinutes(entry, now);
                const greyed = entry.status === 'WAITING_PAYMENT';
                return (
                  <tr
                    key={entry.appointmentId}
                    className={greyed ? `${ROW} text-text-muted` : ROW}
                    data-status={entry.status}
                  >
                    <td className={`${CELL} tabular-nums`}>
                      {entry.queueNumber === null ? '-' : digits(entry.queueNumber)}
                    </td>
                    <td className={CELL}>
                      <span className={ROW_TITLE}>{displayName(entry.patient)}</span>{' '}
                      <span className="text-text-muted">{entry.patient.mrn}</span>
                    </td>
                    <td className={CELL}>
                      <StatusBadge size="sm" status={badge} label={t(labelKey)} />
                    </td>
                    <td className={`${CELL} tabular-nums`}>
                      {minutes === null ? '-' : t('worklist.minutes', { minutes: digits(minutes) })}
                    </td>
                    <td className={CELL}>
                      <EntryAction
                        entry={entry}
                        starting={startingId === entry.visitId}
                        onStart={onStart}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
