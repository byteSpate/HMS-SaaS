'use client';
// The consultation note draft (T-CLI-02; FR-CLI-003, FR-CLI-007; UC-CLI-01 steps 2 and 5, C1, R1;
// W-03; Q-066 interim). The free-text sections and the allergy tri-state autosave two seconds after
// the doctor stops typing, one save at a time with the note's version (SP-03), so a crashed
// browser loses nothing. Sign (Ctrl+Enter) saves what is pending, then signs. An unsigned draft can
// be discarded; an amendment's draft shows its reason.
import {
  NOTE_SECTIONS,
  type ConsultationNote,
  type NoteContent,
  type NoteSection,
} from '@hms/contracts';
import { formatTimeOfDay, type Locale } from '@hms/i18n';
import { Alert, Button, Field, Radio, TextArea, useToast } from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { consultationNotesApi, noteQueryKey } from '../../api/consultation-notes';
import { ApiError } from '../../api/errors';
import { consultationQueryKey, WORKLIST_QUERY_KEY } from '../../api/worklist';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import {
  contentOf,
  formOf,
  hasWriting,
  sameContent,
  type AllergyStatus,
  type NoteForm,
} from './note-form';
import { ALLERGY_LABEL, SECTION_LABEL } from './note-labels';

const AUTOSAVE_MS = 2000;
const ALLERGY_STATUSES: readonly AllergyStatus[] = [
  'KNOWN_ALLERGIES',
  'NO_KNOWN_ALLERGIES',
  'NOT_ASKED',
];

/** FR-CLI-007: known (with the list), no known allergies, or not asked. */
function AllergyFields({
  form,
  invalid,
  onChange,
}: {
  form: NoteForm;
  /** Known allergies chosen with none listed. */
  invalid: boolean;
  onChange: (patch: Partial<NoteForm>) => void;
}) {
  const t = useTranslations();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{t('note.allergies')}</legend>
      <div className="flex flex-wrap gap-4">
        {ALLERGY_STATUSES.map((status) => (
          <Radio
            key={status}
            name="allergies"
            value={status}
            checked={form.allergyStatus === status}
            onChange={() => onChange({ allergyStatus: status })}
            label={t(ALLERGY_LABEL[status])}
          />
        ))}
      </div>
      {form.allergyStatus === 'KNOWN_ALLERGIES' ? (
        <Field
          label={t('note.allergyItems')}
          hint={t('note.allergyItemsHint')}
          error={invalid ? t('note.allergyItemsRequired') : undefined}
        >
          {({ id, ...aria }) => (
            <TextArea
              id={id}
              rows={2}
              value={form.allergyItems}
              onChange={(event) => onChange({ allergyItems: event.target.value })}
              {...aria}
            />
          )}
        </Field>
      ) : null}
    </fieldset>
  );
}

/** Sign (with the sign permission) and discard; the reason a note cannot be signed yet. */
function NoteActions({
  canSign,
  written,
  blocked,
  signing,
  onSign,
  discardLabel,
  discarding,
  onDiscard,
}: {
  canSign: boolean;
  written: boolean;
  blocked: boolean;
  signing: boolean;
  onSign: () => void;
  /** Null when there is no draft to discard. */
  discardLabel: string | null;
  discarding: boolean;
  onDiscard: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-center gap-3">
      {canSign ? (
        <Button loading={signing} disabled={!written || blocked} onClick={onSign}>
          {t('note.sign')}
        </Button>
      ) : (
        <span className="text-sm text-text-muted">{t('note.cannotSign')}</span>
      )}
      {discardLabel ? (
        <Button variant="secondary" loading={discarding} onClick={onDiscard}>
          {discardLabel}
        </Button>
      ) : null}
      {canSign && !written ? (
        <span className="text-sm text-text-muted">{t('note.signNeedsWriting')}</span>
      ) : null}
    </div>
  );
}

export function NoteEditor({
  consultationId,
  note,
  canSign,
}: {
  consultationId: string;
  note: ConsultationNote;
  /** clinical.document.sign; without it the doctor drafts only (UC-CLI-01 D2). */
  canSign: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<NoteForm>(() => formOf(note.draft));
  const [savedAt, setSavedAt] = useState(note.draftSavedAt);
  // What the server holds and at which version: the next command is sent with these.
  const version = useRef(note.version);
  const saved = useRef<NoteContent | null>(note.draft);
  // One save at a time, so each carries the version the previous one returned.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<number | undefined>(undefined);
  const signKey = useRef(new Map<number, string>());

  const keep = (next: ConsultationNote) => {
    version.current = next.version;
    saved.current = next.draft;
    setSavedAt(next.draftSavedAt);
    queryClient.setQueryData(noteQueryKey(consultationId), next);
  };

  const save = useMutation({
    mutationFn: (content: NoteContent) =>
      consultationNotesApi.saveDraft(
        consultationId,
        { content, expectedVersion: version.current },
        crypto.randomUUID(),
      ),
    onSuccess: keep,
  });

  /** Saves the form if it differs from what the server holds; resolves when saved. */
  const flush = () => {
    window.clearTimeout(timer.current);
    queue.current = queue.current.then(async () => {
      const content = contentOf(form);
      if (!content || sameContent(content, saved.current)) return;
      await save.mutateAsync(content);
    });
    return queue.current;
  };

  // The debounce: every form change re-arms the timer, and flush reads that render's form.
  useEffect(() => {
    timer.current = window.setTimeout(() => {
      void flush().catch(() => undefined);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer.current);
  }, [form]);

  const sign = useMutation({
    mutationFn: async () => {
      await flush();
      const key = signKey.current.get(version.current) ?? crypto.randomUUID();
      signKey.current.set(version.current, key);
      return consultationNotesApi.sign(consultationId, { expectedVersion: version.current }, key);
    },
    onSuccess: async (next) => {
      keep(next);
      // UC-CLI-01 step 5: the consultation is now CONSULTED, on this screen and the worklist.
      await queryClient.invalidateQueries({
        queryKey: consultationQueryKey(consultationId),
        exact: true,
      });
      await queryClient.invalidateQueries({ queryKey: WORKLIST_QUERY_KEY });
      toast.show({ title: t('note.signed'), tone: 'success' });
    },
  });

  const discard = useMutation({
    mutationFn: async () => {
      window.clearTimeout(timer.current);
      await queue.current.catch(() => undefined);
      return consultationNotesApi.discard(
        consultationId,
        { expectedVersion: version.current },
        crypto.randomUUID(),
      );
    },
    onSuccess: (next) => {
      keep(next);
      setForm(formOf(null));
      toast.show({ title: t('note.discarded'), tone: 'success' });
    },
  });

  const failure = save.error ?? sign.error ?? discard.error;
  const stale = failure instanceof ApiError && failure.code === 'STALE_RECORD';
  const update = (patch: Partial<NoteForm>) => setForm((current) => ({ ...current, ...patch }));
  const knownWithoutItems = form.allergyStatus === 'KNOWN_ALLERGIES' && contentOf(form) === null;
  const hasDraft = note.status === 'DRAFT' || saved.current !== null;
  const reload = () =>
    void queryClient.invalidateQueries({ queryKey: noteQueryKey(consultationId) });

  const discardLabel = note.amendReason ? t('note.discardAmendment') : t('note.discard');
  let saveState: string | null = null;
  if (save.isPending) saveState = t('note.saving');
  else if (savedAt) saveState = t('note.savedAt', { time: formatTimeOfDay(savedAt, locale) });

  return (
    <section
      aria-labelledby="note-title"
      className="flex flex-col gap-4"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.ctrlKey && canSign && hasWriting(form)) {
          event.preventDefault();
          sign.mutate();
        }
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="note-title" className="text-lg font-semibold">
          {t('note.title')}
        </h2>
        <span className="text-sm text-text-muted tabular-nums" role="status">
          {saveState}
        </span>
      </div>
      {note.amendReason ? (
        <Alert tone="info">
          {t('note.amending', {
            version: note.versions[0]?.versionNo ?? 1,
            reason: note.amendReason,
          })}
        </Alert>
      ) : null}
      {stale ? (
        <div className="flex flex-col items-start gap-2">
          <Alert tone="warning">{t('note.staleNotice')}</Alert>
          <Button variant="secondary" onClick={reload}>
            {t('note.reload')}
          </Button>
        </div>
      ) : null}
      {failure && !stale ? <Alert tone="danger">{errorMessage(failure)}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {NOTE_SECTIONS.map((section: NoteSection) => (
          <Field key={section} label={t(SECTION_LABEL[section])}>
            {({ id, ...aria }) => (
              <TextArea
                id={id}
                rows={3}
                value={form[section]}
                onChange={(event) => update({ [section]: event.target.value })}
                {...aria}
              />
            )}
          </Field>
        ))}
      </div>

      <AllergyFields form={form} invalid={knownWithoutItems} onChange={update} />

      <NoteActions
        canSign={canSign}
        written={hasWriting(form)}
        blocked={knownWithoutItems || stale}
        signing={sign.isPending}
        onSign={() => sign.mutate()}
        discardLabel={hasDraft ? discardLabel : null}
        discarding={discard.isPending}
        onDiscard={() => discard.mutate()}
      />
    </section>
  );
}
