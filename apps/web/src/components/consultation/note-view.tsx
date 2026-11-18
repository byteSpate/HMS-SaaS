'use client';
// The signed consultation note (T-CLI-02; FR-CLI-003, FR-CLI-007; UC-CLI-02; FPR-06). The latest
// version in full, marked "Amended" from v2 on with its reason, and every earlier version still
// readable below it. Allergies read as recorded; "not asked" is never shown as "no allergies".
import type { ConsultationNote, NoteContent, SignedNoteVersion } from '@hms/contracts';
import { NOTE_SECTIONS } from '@hms/contracts';
import { formatDateTime, toLocaleDigits, type Locale } from '@hms/i18n';
import { Button, StatusBadge } from '@hms/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { consultationNotesApi, noteQueryKey } from '../../api/consultation-notes';
import { AmendDialog } from './amend-dialog';
import { ALLERGY_LABEL, SECTION_LABEL } from './note-labels';

function NoteContentView({ content }: { content: NoteContent }) {
  const t = useTranslations();
  const allergies =
    content.allergies.status === 'KNOWN_ALLERGIES'
      ? `${t(ALLERGY_LABEL.KNOWN_ALLERGIES)}: ${content.allergies.items.join(', ')}`
      : t(ALLERGY_LABEL[content.allergies.status]);
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {NOTE_SECTIONS.filter((section) => content[section]).map((section) => (
        <div key={section} className="flex flex-col gap-1">
          <dt className="text-sm text-text-muted">{t(SECTION_LABEL[section])}</dt>
          <dd className="whitespace-pre-wrap">{content[section]}</dd>
        </div>
      ))}
      <div className="flex flex-col gap-1">
        <dt className="text-sm text-text-muted">{t('note.allergies')}</dt>
        <dd>{allergies}</dd>
      </div>
    </dl>
  );
}

function VersionHeading({ version }: { version: SignedNoteVersion }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
      <span className="font-medium text-text">
        {t('note.versionTitle', { version: toLocaleDigits(String(version.versionNo), locale) })}
      </span>
      {version.versionNo > 1 ? (
        <StatusBadge size="sm" status="review" label={t('note.amended')} />
      ) : null}
      <span>
        {t('note.signedBy', {
          name: version.signedBy,
          time: formatDateTime(version.signedAt, locale),
        })}
      </span>
      {version.amendReason ? (
        <span>{t('note.amendReasonShown', { reason: version.amendReason })}</span>
      ) : null}
    </p>
  );
}

export function NoteView({
  consultationId,
  note,
  canAmend,
}: {
  consultationId: string;
  note: ConsultationNote;
  /** clinical.document.amend (UC-CLI-02). */
  canAmend: boolean;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [amending, setAmending] = useState(false);
  const [latest, ...earlier] = note.versions;
  if (!latest) return null;

  return (
    <section aria-labelledby="note-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="note-title" className="text-lg font-semibold">
          {t('note.title')}
        </h2>
        {canAmend ? (
          <Button variant="secondary" onClick={() => setAmending(true)}>
            {t('note.amend')}
          </Button>
        ) : null}
      </div>
      <VersionHeading version={latest} />
      <NoteContentView content={latest.content} />
      {earlier.length > 0 ? (
        <details className="rounded-panel border border-border p-3">
          <summary className="cursor-pointer font-medium">{t('note.earlierVersions')}</summary>
          <div className="mt-3 flex flex-col gap-4">
            {earlier.map((version) => (
              <div key={version.versionNo} className="flex flex-col gap-2">
                <VersionHeading version={version} />
                <NoteContentView content={version.content} />
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {amending ? (
        <AmendDialog
          texts={{
            title: t('note.amendTitle'),
            body: t('note.amendBody'),
            reason: t('note.amendReason'),
            submit: t('note.amendSubmit'),
          }}
          onAmend={async (reason, key) => {
            const next = await consultationNotesApi.amend(
              consultationId,
              { reason, expectedVersion: note.version },
              key,
            );
            queryClient.setQueryData(noteQueryKey(consultationId), next);
          }}
          onOpenChange={setAmending}
        />
      ) : null}
    </section>
  );
}
