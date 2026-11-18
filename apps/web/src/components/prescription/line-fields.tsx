'use client';
// One prescription line being written (T-CLI-03; FR-CLI-004..006; Q-067 interim): dose and
// instructions as free text, route, frequency and duration from the hospital's lists, an optional
// quantity, the supply choice (hospital pharmacy or outside) and an optional patient note.
import {
  FULFILMENTS,
  type PrescribingTermChoice,
  type PrescribingTermChoices,
} from '@hms/contracts';
import type { Locale } from '@hms/i18n';
import { Field, IconButton, Radio, Select, TextInput } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';
import {
  medicineLabel,
  quantityOf,
  saysHowToTake,
  termLabel,
  type LineForm,
} from './prescription-form';
import { FULFILMENT_LABEL } from './prescription-labels';

const TERM_FIELDS = [
  { field: 'routeTermId', list: 'routes', labelKey: 'prescription.route' },
  { field: 'frequencyTermId', list: 'frequencies', labelKey: 'prescription.frequency' },
  { field: 'durationTermId', list: 'durations', labelKey: 'prescription.duration' },
] as const;

const TEXT_FIELDS = [
  { field: 'instructionsBn', labelKey: 'prescription.instructionsBn', lang: 'bn' },
  { field: 'instructionsEn', labelKey: 'prescription.instructionsEn', lang: 'en' },
] as const;

function termOptions(
  terms: readonly PrescribingTermChoice[],
  selected: string,
  noneLabel: string,
  locale: Locale,
) {
  const options = [
    { value: '', label: noneLabel },
    ...terms.map((term) => ({ value: term.termId, label: termLabel(term, locale) })),
  ];
  // A draft may hold an entry deactivated since; it shows until the doctor changes it.
  return selected === '' || options.some((option) => option.value === selected)
    ? options
    : [...options, { value: selected, label: selected }];
}

export function LineFields({
  line,
  index,
  terms,
  onChange,
  onRemove,
}: {
  line: LineForm;
  index: number;
  terms: PrescribingTermChoices;
  onChange: (patch: Partial<LineForm>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const name = medicineLabel(line.medicine);
  const badQuantity = quantityOf(line) === undefined;
  return (
    <fieldset className="flex flex-col gap-3 rounded-panel border border-border p-3">
      <legend className="px-1 font-medium">
        {index + 1}. {name}
        <span className="ms-2 text-sm font-normal text-text-muted">
          {line.medicine.genericName}
        </span>
      </legend>
      <div className="flex justify-end">
        <IconButton
          icon="trash"
          variant="secondary"
          label={t('prescription.removeLine', { name })}
          onClick={onRemove}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('prescription.dose')} hint={t('prescription.doseHint')}>
          {({ id, ...aria }) => (
            <TextInput
              id={id}
              maxLength={60}
              value={line.dose}
              onChange={(event) => onChange({ dose: event.target.value })}
              {...aria}
            />
          )}
        </Field>
        {TERM_FIELDS.map(({ field, list, labelKey }) => (
          <Field key={field} label={t(labelKey)}>
            {({ id, ...aria }) => (
              <Select
                id={id}
                value={line[field]}
                options={termOptions(terms[list], line[field], t('prescription.noChoice'), locale)}
                onChange={(event) => onChange({ [field]: event.target.value })}
                {...aria}
              />
            )}
          </Field>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TEXT_FIELDS.map(({ field, labelKey, lang }) => (
          <Field key={field} label={t(labelKey)}>
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                lang={lang}
                maxLength={300}
                value={line[field]}
                onChange={(event) => onChange({ [field]: event.target.value })}
                {...aria}
              />
            )}
          </Field>
        ))}
      </div>
      {saysHowToTake(line) ? null : (
        <p className="text-sm text-text-muted">{t('prescription.lineNeedsHow')}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_1fr] sm:items-start">
        <Field
          label={t('prescription.quantity')}
          error={badQuantity ? t('prescription.quantityInvalid') : undefined}
        >
          {({ id, ...aria }) => (
            <TextInput
              id={id}
              inputMode="numeric"
              maxLength={4}
              value={line.quantity}
              onChange={(event) => onChange({ quantity: event.target.value })}
              {...aria}
            />
          )}
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t('prescription.fulfilment')}</legend>
          <div className="flex flex-wrap gap-4">
            {FULFILMENTS.map((fulfilment) => (
              <Radio
                key={fulfilment}
                name={`fulfilment-${line.lineId}`}
                value={fulfilment}
                checked={line.fulfilment === fulfilment}
                onChange={() => onChange({ fulfilment })}
                label={t(FULFILMENT_LABEL[fulfilment])}
              />
            ))}
          </div>
        </fieldset>
        <Field label={t('prescription.patientNote')} hint={t('prescription.patientNoteHint')}>
          {({ id, ...aria }) => (
            <TextInput
              id={id}
              maxLength={200}
              value={line.patientNote}
              onChange={(event) => onChange({ patientNote: event.target.value })}
              {...aria}
            />
          )}
        </Field>
      </div>
    </fieldset>
  );
}
