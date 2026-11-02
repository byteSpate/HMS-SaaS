'use client';
// The hospital code on the sign-in forms (T-ACC-06; C-099, C-095). Remembered per browser so staff
// type it once. Storage can be blocked, so the form must work without it.
import { Field, TextInput } from '@hms/ui';
import { useTranslations } from 'next-intl';
import { type RefObject, useEffect, useState } from 'react';

const STORAGE_KEY = 'hms.hospitalCode';

export function rememberHospitalCode(code: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Blocked storage only means typing the code again next time.
  }
}

function rememberedHospitalCode(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Starts empty and fills in after hydration, so server and browser render the same page. */
export function useHospitalCode(): [string, (code: string) => void] {
  const [code, setCode] = useState('');
  useEffect(() => {
    const remembered = rememberedHospitalCode();
    if (remembered) setCode((current) => current || remembered);
  }, []);
  return [code, setCode];
}

export function HospitalCodeField({
  value,
  onChange,
  missing,
  inputRef,
}: {
  value: string;
  onChange: (code: string) => void;
  missing: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const t = useTranslations();
  return (
    <Field
      label={t('login.hospitalCodeLabel')}
      hint={t('login.hospitalCodeHint')}
      required
      error={missing ? t('validation.required') : undefined}
    >
      {({ id, invalid, required, ...aria }) => (
        <TextInput
          id={id}
          ref={inputRef}
          name="hospitalCode"
          autoComplete="organization"
          autoCapitalize="none"
          spellCheck={false}
          invalid={invalid}
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...aria}
        />
      )}
    </Field>
  );
}
