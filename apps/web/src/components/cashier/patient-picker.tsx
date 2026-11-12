'use client';
// Choosing whose invoices to take payment for (T-BIL-04; SCR-06; UC-BIL-01 step 1): today's queue
// of patients who still owe, with their balances, and a search by MRN, phone or name (the front
// desk's search, T-PAT-02). Choosing a patient opens their open invoices.
import type { PatientRef, PatientSummary } from '@hms/contracts';
import { formatMoney, type Locale } from '@hms/i18n';
import { Alert, Button, Field, Skeleton, TextInput } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { INVOICES_QUERY_KEY, invoicesApi } from '../../api/invoices';
import { patientQueryKeys, patientsApi } from '../../api/patients';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { sumAmounts } from '../../money';
import { displayName } from '../patients/patient-text';
import { useDebouncedValue } from '../patients/use-debounced-value';

/** The front desk's rule: digits search at once, a name from three letters. */
const searchable = (term: string) => /\d/.test(term) || Array.from(term).length >= 3;

function SearchResults({
  patients,
  onSelect,
}: {
  patients: PatientSummary[];
  onSelect: (patient: PatientRef) => void;
}) {
  const t = useTranslations();
  if (patients.length === 0) {
    return <p className="text-sm text-text-muted">{t('cashier.searchEmpty')}</p>;
  }
  return (
    <ul className="flex flex-col gap-1" aria-label={t('cashier.searchLabel')}>
      {patients.map((patient) => (
        <li key={patient.patientId}>
          <Button
            variant="secondary"
            className="w-full justify-between"
            onClick={() =>
              onSelect({
                patientId: patient.patientId,
                mrn: patient.mrn,
                nameEn: patient.nameEn,
                nameBn: patient.nameBn,
              })
            }
          >
            <span>{displayName(patient)}</span>
            <span className="text-text-muted">{patient.mrn}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function PatientPicker({ onSelect }: { onSelect: (patient: PatientRef) => void }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const errorMessage = useApiErrorMessage();
  const [term, setTerm] = useState('');
  const settled = useDebouncedValue(term.trim(), 250);
  const queue = useQuery({
    queryKey: [...INVOICES_QUERY_KEY, 'queue'],
    queryFn: invoicesApi.queue,
  });
  const results = useQuery({
    queryKey: patientQueryKeys.search(settled),
    queryFn: () => patientsApi.search(settled),
    enabled: searchable(settled),
    retry: false,
  });
  const money = (amount: string) => formatMoney(amount, locale, { symbol: 'sign' });

  return (
    <div className="flex flex-col gap-4">
      <Field label={t('cashier.searchLabel')} hint={t('cashier.searchHint')}>
        {({ id, ...aria }) => (
          <TextInput
            id={id}
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            {...aria}
          />
        )}
      </Field>
      {results.error ? <Alert tone="danger">{errorMessage(results.error)}</Alert> : null}
      {searchable(settled) && results.data ? (
        <SearchResults patients={results.data.patients} onSelect={onSelect} />
      ) : null}

      <section aria-labelledby="cashier-queue-title" className="flex flex-col gap-2">
        <h2 id="cashier-queue-title" className="text-base font-semibold">
          {t('cashier.queueTitle')}
        </h2>
        {queue.error ? <Alert tone="danger">{errorMessage(queue.error)}</Alert> : null}
        {queue.isPending ? <Skeleton className="h-24" /> : null}
        {queue.data?.length === 0 ? (
          <p className="text-sm text-text-muted">{t('cashier.queueEmpty')}</p>
        ) : null}
        <ul className="flex flex-col gap-1">
          {queue.data?.map(({ patient, invoices }) => (
            <li key={patient.patientId}>
              <Button
                variant="secondary"
                className="w-full justify-between"
                onClick={() => onSelect(patient)}
              >
                <span>
                  {displayName(patient)} <span className="text-text-muted">{patient.mrn}</span>
                </span>
                <span className="tabular-nums">
                  {t('cashier.due', {
                    amount: money(sumAmounts(invoices.map((invoice) => invoice.balance))),
                  })}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
