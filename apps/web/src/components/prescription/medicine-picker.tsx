'use client';
// Find a medicine to prescribe (T-CLI-03; FR-CLI-004): a search box over the hospital's active
// catalogue by brand or generic name. Choosing one adds a line and empties the box for the next.
import type { MedicineChoice } from '@hms/contracts';
import { Combobox, type ComboboxOption } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { prescribingApi } from '../../api/medicines';
import { medicineSearchKey } from '../../api/prescriptions';
import { useDebouncedValue } from '../patients/use-debounced-value';
import { medicineLabel } from './prescription-form';

/** The API needs at least one character; two keep the list short while typing. */
const MIN_SEARCH = 2;

export function MedicinePicker({ onPick }: { onPick: (medicine: MedicineChoice) => void }) {
  const t = useTranslations();
  const [term, setTerm] = useState('');
  // A new key after each choice empties the field for the next medicine.
  const [resetKey, setResetKey] = useState(0);
  const settled = useDebouncedValue(term.trim(), 250);
  const searchable = Array.from(settled).length >= MIN_SEARCH;
  const results = useQuery({
    queryKey: medicineSearchKey(settled),
    queryFn: () => prescribingApi.searchMedicines(settled),
    enabled: searchable,
    retry: false,
  });
  const medicines = searchable ? (results.data ?? []) : [];
  const options: ComboboxOption[] = medicines.map((medicine) => ({
    id: medicine.medicineId,
    label: medicineLabel(medicine),
    description: medicine.genericName,
  }));

  function pick(option: ComboboxOption | null): void {
    const medicine = medicines.find((row) => row.medicineId === option?.id);
    if (!medicine) return;
    onPick(medicine);
    setTerm('');
    setResetKey((key) => key + 1);
  }

  return (
    <Combobox
      key={resetKey}
      aria-label={t('prescription.searchLabel')}
      placeholder={t('prescription.searchPlaceholder')}
      options={options}
      minQueryLength={MIN_SEARCH}
      loading={searchable && (results.isFetching || settled !== term.trim())}
      listLabel={t('prescription.searchList')}
      emptyLabel={t('prescription.searchEmpty')}
      loadingLabel={t('prescription.searchLoading')}
      announceResults={(count) => t('prescription.searchResults', { count })}
      onQueryChange={setTerm}
      onValueChange={pick}
    />
  );
}
