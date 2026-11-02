'use client';
// SCR-24: search this hospital's audit trail by person, action, record and time (T-PLT-02;
// FR-AUD-005; AT-AUD-005). audit.view; the API enforces it.
import { useInfiniteQuery } from '@tanstack/react-query';
import { Alert, Button, Field, PageLayout, Skeleton, TextInput } from '@hms/ui';
import { formatDateTime } from '@hms/i18n';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { auditApi, type AuditFilters } from '../../../../src/api/audit';
import {
  CELL,
  CODE_CHIP,
  HEAD_CELL,
  ROW,
  TABLE,
  TABLE_FRAME,
} from '../../../../src/components/admin/admin-table';
import { useApiErrorMessage } from '../../../../src/i18n/use-api-error-message';

// Dates are picked in hospital time. Bangladesh has one UTC offset all year (C-050 formats).
const HOSPITAL_OFFSET = '+06:00';

// Full keys as literals, so the unused-key check can see them.
const OUTCOME_KEYS = {
  SUCCEEDED: 'admin.auditOutcomes.SUCCEEDED',
  DENIED: 'admin.auditOutcomes.DENIED',
  FAILED: 'admin.auditOutcomes.FAILED',
} as const;

interface Draft {
  actor: string;
  action: string;
  targetId: string;
  from: string;
  to: string;
}

const EMPTY: Draft = { actor: '', action: '', targetId: '', from: '', to: '' };

function toFilters(draft: Draft): AuditFilters {
  return {
    actor: draft.actor.trim(),
    action: draft.action.trim(),
    targetId: draft.targetId.trim(),
    ...(draft.from ? { from: `${draft.from}T00:00:00${HOSPITAL_OFFSET}` } : {}),
    ...(draft.to ? { to: `${draft.to}T23:59:59.999${HOSPITAL_OFFSET}` } : {}),
  };
}

export default function AuditPage() {
  const t = useTranslations();
  const locale = useLocale();
  const errorMessage = useApiErrorMessage();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [filters, setFilters] = useState<AuditFilters>({});

  const events = useInfiniteQuery({
    queryKey: ['audit-events', filters],
    queryFn: ({ pageParam }) => auditApi.search(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = events.data?.pages.flatMap((page) => page.items) ?? [];

  function search(event: FormEvent) {
    event.preventDefault();
    setFilters(toFilters(draft));
  }

  const input = (name: keyof Draft, label: string, type: 'text' | 'date' = 'text') => (
    <Field label={label}>
      {({ id, invalid, required: _required, ...aria }) => (
        <TextInput
          id={id}
          type={type}
          value={draft[name]}
          invalid={invalid}
          onChange={(change) => setDraft({ ...draft, [name]: change.target.value })}
          {...aria}
        />
      )}
    </Field>
  );

  return (
    <PageLayout title={t('admin.auditTitle')} description={t('admin.auditDescription')}>
      <form onSubmit={search} className="mb-4 grid gap-3 md:grid-cols-3">
        {input('actor', t('admin.auditActor'))}
        {input('action', t('admin.auditAction'))}
        {input('targetId', t('admin.auditRecord'))}
        {input('from', t('admin.auditFrom'), 'date')}
        {input('to', t('admin.auditTo'), 'date')}
        <div className="flex items-end">
          <Button type="submit">{t('admin.auditSearch')}</Button>
        </div>
      </form>

      {events.error ? <Alert tone="danger">{errorMessage(events.error)}</Alert> : null}
      {events.isPending ? <Skeleton className="h-40" /> : null}
      {events.data && rows.length === 0 ? <p>{t('admin.auditEmpty')}</p> : null}
      {rows.length > 0 ? (
        <div className={TABLE_FRAME}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('admin.auditWhen')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('admin.auditActor')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('admin.auditAction')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('admin.auditOutcome')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('admin.auditReason')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={ROW}>
                  <td className={`${CELL} tabular-nums`}>
                    {formatDateTime(new Date(row.occurredAt), locale as 'en' | 'bn-BD')}
                  </td>
                  <td className={CELL}>{row.actorName ?? t('admin.auditSystem')}</td>
                  <td className={CELL}>
                    <span className={CODE_CHIP}>{row.action}</span>
                  </td>
                  <td className={CELL}>{t(OUTCOME_KEYS[row.outcome])}</td>
                  <td className={`${CELL} text-text-muted`}>{row.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {events.hasNextPage ? (
        <div className="mt-4">
          <Button
            variant="secondary"
            onClick={() => void events.fetchNextPage()}
            disabled={events.isFetchingNextPage}
          >
            {t('admin.auditMore')}
          </Button>
        </div>
      ) : null}
    </PageLayout>
  );
}
