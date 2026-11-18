'use client';
// Prescribing lists (T-CLI-03; Q-067 interim: the hospital enters its vocabularies; FR-I18N-006):
// the routes, frequencies and durations doctors pick from, one panel each, in picker order. A
// label missing in one language is marked. admin.config.publish; the API enforces it.
import {
  PRESCRIBING_TERM_KINDS,
  type PrescribingTermKind,
  type PrescribingTermRecord,
} from '@hms/contracts';
import { Button, IconButton, PageLayout, StatusBadge, WorkPanel } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PRESCRIBING_TERMS_QUERY_KEY, prescribingTermsApi } from '../../../../src/api/medicines';
import {
  CELL,
  HEAD_CELL,
  ROW,
  ROW_TITLE,
  TABLE,
  TABLE_FRAME,
} from '../../../../src/components/admin/admin-table';
import { TermDialog } from '../../../../src/components/medicines/term-dialog';
import { termsOfKind } from '../../../../src/components/medicines/term-form';
import { TERM_KIND_KEYS } from '../../../../src/components/medicines/term-labels';
import { QueryView } from '../../../../src/components/query-view';

type OpenDialog =
  { kind: PrescribingTermKind } | { kind: PrescribingTermKind; termId: string } | null;

const MARKER = 'text-[0.6875rem] italic text-text-muted';

function TermLabel({ term }: { term: PrescribingTermRecord }) {
  const t = useTranslations();
  return (
    <>
      <p className={ROW_TITLE}>{term.labelEn ?? <span lang="bn">{term.labelBn}</span>}</p>
      {term.labelEn && term.labelBn ? (
        <p lang="bn" className="text-[0.6875rem] text-text-muted">
          {term.labelBn}
        </p>
      ) : null}
      {/* FR-I18N-006: the missing translation is marked, never silently filled. */}
      {term.labelBn ? null : <p className={MARKER}>{t('prescribingTerms.missingBn')}</p>}
      {term.labelEn ? null : <p className={MARKER}>{t('prescribingTerms.missingEn')}</p>}
    </>
  );
}

function TermTable({
  terms,
  onEdit,
}: {
  terms: PrescribingTermRecord[];
  onEdit: (term: PrescribingTermRecord) => void;
}) {
  const t = useTranslations();
  if (terms.length === 0) {
    return <p className="text-sm text-text-muted">{t('prescribingTerms.emptyKind')}</p>;
  }
  return (
    <div className={TABLE_FRAME}>
      <table className={TABLE}>
        <thead>
          <tr>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('prescribingTerms.columnLabel')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('prescribingTerms.columnOrder')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('prescribingTerms.columnStatus')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-end`}>
              {t('prescribingTerms.columnActions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {terms.map((term) => (
            <tr key={term.termId} className={ROW}>
              <td className={CELL} data-label={t('prescribingTerms.columnLabel')}>
                <TermLabel term={term} />
              </td>
              <td className={`${CELL} tabular-nums`} data-label={t('prescribingTerms.columnOrder')}>
                {term.sortOrder}
              </td>
              <td className={CELL} data-label={t('prescribingTerms.columnStatus')}>
                {term.active ? (
                  <StatusBadge
                    size="sm"
                    status="active"
                    label={t('prescribingTerms.statusActive')}
                  />
                ) : (
                  <StatusBadge
                    size="sm"
                    status="idle"
                    label={t('prescribingTerms.statusInactive')}
                  />
                )}
              </td>
              <td className={`${CELL} text-end`} data-cell="actions">
                <IconButton
                  icon="pencil"
                  label={`${t('prescribingTerms.edit')}: ${term.labelEn ?? term.labelBn ?? ''}`}
                  variant="secondary"
                  onClick={() => onEdit(term)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrescribingListsPage() {
  const t = useTranslations();
  const terms = useQuery({
    queryKey: PRESCRIBING_TERMS_QUERY_KEY,
    queryFn: prescribingTermsApi.list,
  });
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const editing =
    dialog && 'termId' in dialog
      ? terms.data?.find((row) => row.termId === dialog.termId)
      : undefined;
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <PageLayout title={t('prescribingTerms.title')} description={t('prescribingTerms.description')}>
      <QueryView query={terms} isEmpty={() => false} columns={4}>
        {(rows) => (
          <div className="flex flex-col gap-6">
            {PRESCRIBING_TERM_KINDS.map((kind) => (
              <WorkPanel
                key={kind}
                title={t(TERM_KIND_KEYS[kind])}
                action={
                  <Button variant="secondary" onClick={() => setDialog({ kind })}>
                    {`${t('prescribingTerms.add')}: ${t(TERM_KIND_KEYS[kind])}`}
                  </Button>
                }
              >
                <TermTable
                  terms={termsOfKind(rows, kind)}
                  onEdit={(term) => setDialog({ kind: term.kind, termId: term.termId })}
                />
              </WorkPanel>
            ))}
          </div>
        )}
      </QueryView>
      {dialog && !('termId' in dialog) ? (
        <TermDialog kind={dialog.kind} onOpenChange={close} />
      ) : null}
      {editing ? (
        <TermDialog
          key={`${editing.termId}:${editing.version}`}
          kind={editing.kind}
          term={editing}
          onOpenChange={close}
        />
      ) : null}
    </PageLayout>
  );
}
