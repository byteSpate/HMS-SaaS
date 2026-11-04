'use client';
// How a patient reads on every screen (T-PAT-02, T-PAT-04; FR-PAT-010, FR-PAT-007; F section 3 rule 5):
// both names when both exist and never a machine transliteration, the age marked when it is an
// estimate, and the NID masked to its last four digits.
import type { DuplicateCandidate, PatientSex } from '@hms/contracts';
import { toLocaleDigits, type Locale } from '@hms/i18n';
import { useLocale, useTranslations } from 'next-intl';

const SEX_KEYS = {
  MALE: 'patients.sexMale',
  FEMALE: 'patients.sexFemale',
  OTHER: 'patients.sexOther',
  UNKNOWN: 'patients.sexUnknown',
} as const;

const REASON_KEYS = {
  SAME_PHONE: 'patients.reasonSamePhone',
  SAME_NID: 'patients.reasonSameNid',
  SIMILAR_NAME: 'patients.reasonSimilarName',
} as const;

export function displayName(patient: { nameBn: string | null; nameEn: string | null }): string {
  return [patient.nameBn, patient.nameEn].filter(Boolean).join(' / ');
}

export function usePatientText() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  // Digits only, no grouping: a phone number or NID is an identifier, not an amount.
  const digits = (value: number | string) => toLocaleDigits(String(value), locale);
  return {
    digits,
    sex: (sex: PatientSex) => t(SEX_KEYS[sex]),
    age: (ageYears: number | null, estimated: boolean) => {
      if (ageYears === null) return t('patients.ageUnknown');
      const years = digits(ageYears);
      return estimated ? t('patients.ageEstimated', { years }) : t('patients.ageYears', { years });
    },
    nid: (last4: string | null) =>
      last4 === null
        ? t('patients.notRecorded')
        : t('patients.nidMasked', { last4: digits(last4) }),
    reasons: (reasons: DuplicateCandidate['reasons']) =>
      reasons.map((reason) => t(REASON_KEYS[reason])).join(', '),
  };
}
