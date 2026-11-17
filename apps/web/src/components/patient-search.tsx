'use client';
// One patient search from every screen, in the top bar (Role Home v2 design, "Global search"):
// the front desk's search rule (digits at once, a name from three letters), the matches with
// their banner fields, and Enter or a click opens the patient record. "/" focuses it from
// anywhere (shell-shortcuts.tsx). Shown only with patient.record.search; the API checks it again.
// Implements: T-UI-02, T-PAT-02, F section 9 (search rules).
import type { PatientSummary } from '@hms/contracts';
import { Combobox, type ComboboxOption, Icon, ShortcutKey } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { patientQueryKeys, patientsApi } from '../api/patients';
import { displayName, usePatientText } from './patients/patient-text';
import { useDebouncedValue } from './patients/use-debounced-value';

/** The id "/" focuses (shell-shortcuts.tsx). */
export const PATIENT_SEARCH_ID = 'shell-patient-search';

/** The front desk's rule: digits search at once, a name from three letters (like the API). */
const searchable = (term: string) => /\d/.test(term) || Array.from(term).length >= 3;

function usePatientOption() {
  const text = usePatientText();
  return (patient: PatientSummary): ComboboxOption => ({
    id: patient.patientId,
    label: displayName(patient),
    description: [
      patient.mrn,
      `${text.sex(patient.sex)}, ${text.age(patient.ageYears, patient.ageEstimated)}`,
      patient.phone ? text.digits(patient.phone) : null,
    ]
      .filter(Boolean)
      .join(' - '),
  });
}

export function PatientSearch() {
  const t = useTranslations();
  const router = useRouter();
  const toOption = usePatientOption();
  const [term, setTerm] = useState('');
  // A new key after each choice empties the field for the next patient.
  const [resetKey, setResetKey] = useState(0);
  const settled = useDebouncedValue(term.trim(), 250);
  const results = useQuery({
    queryKey: patientQueryKeys.search(settled),
    queryFn: () => patientsApi.search(settled),
    enabled: searchable(settled),
    retry: false,
  });
  const waiting = searchable(term.trim()) && (settled !== term.trim() || results.isFetching);

  function open(option: ComboboxOption | null): void {
    if (!option) return;
    setTerm('');
    setResetKey((key) => key + 1);
    router.push(`/patients/${option.id}`);
  }

  return (
    <div className="relative w-full">
      <Icon
        name="search"
        size={18}
        className="pointer-events-none absolute start-2.5 top-1/2 z-10 -translate-y-1/2 text-text-muted"
      />
      <Combobox
        key={resetKey}
        id={PATIENT_SEARCH_ID}
        aria-label={t('shell.searchLabel')}
        placeholder={t('shell.searchPlaceholder')}
        className="ps-9 pe-9"
        options={searchable(settled) ? (results.data?.patients ?? []).map(toOption) : []}
        minQueryLength={1}
        loading={waiting}
        listLabel={t('shell.searchListLabel')}
        emptyLabel={t('shell.searchEmpty')}
        loadingLabel={t('shell.searchLoading')}
        announceResults={(count) => t('shell.searchResults', { count })}
        onQueryChange={setTerm}
        onValueChange={open}
      />
      <ShortcutKey className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2">
        /
      </ShortcutKey>
    </div>
  );
}
