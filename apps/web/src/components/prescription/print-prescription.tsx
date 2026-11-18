'use client';
// Print the signed prescription (T-CLI-03; FR-CLI-005; C-025, C-044): the doctor picks the
// language (Bangla, English or both; the screen's language first), the server renders the latest
// signed version as an A4 page and the browser prints it from a hidden frame. Printing is audited
// and changes nothing.
import { PRINT_LANGUAGES, type PrintPrescriptionRequest } from '@hms/contracts';
import type { Locale } from '@hms/i18n';
import { Alert, Button, Field, Select } from '@hms/ui';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { prescriptionsApi } from '../../api/prescriptions';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { printHtml } from '../../print-html';

type PrintLanguage = PrintPrescriptionRequest['language'];

const LANGUAGE_LABEL = {
  en: 'prescription.languageEn',
  'bn-BD': 'prescription.languageBn',
  bilingual: 'prescription.languageBoth',
} as const satisfies Record<PrintLanguage, string>;

export function PrintPrescription({ consultationId }: { consultationId: string }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const errorMessage = useApiErrorMessage();
  const [language, setLanguage] = useState<PrintLanguage>(locale);
  const print = useMutation({
    mutationFn: () => prescriptionsApi.print(consultationId, { language }, crypto.randomUUID()),
    onSuccess: (page) => printHtml(page.html),
  });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={t('prescription.printLanguage')}>
        {({ id, ...aria }) => (
          <Select
            id={id}
            value={language}
            options={PRINT_LANGUAGES.map((value) => ({ value, label: t(LANGUAGE_LABEL[value]) }))}
            onChange={(event) => setLanguage(event.target.value as PrintLanguage)}
            {...aria}
          />
        )}
      </Field>
      <Button loading={print.isPending} onClick={() => print.mutate()}>
        {t('prescription.print')}
      </Button>
      {print.error ? <Alert tone="danger">{errorMessage(print.error)}</Alert> : null}
    </div>
  );
}
