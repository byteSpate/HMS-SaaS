'use client';
// Second step of sign-in for a privileged role (T-ACC-04; FR-ACC-006; UC-ACC-01 step 3): the
// 6-digit code from the authenticator app, or one recovery code when the phone is lost. A wrong
// code counts towards the account lock on the server, like a wrong password.
import { Alert, Button, Field, TextInput } from '@hms/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
import { useApiErrorMessage } from '../i18n/use-api-error-message';
import { useSessionActions } from '../session/use-session';

type Mode = 'app' | 'recovery';

export function MfaVerifyForm() {
  const t = useTranslations();
  const router = useRouter();
  const errorMessage = useApiErrorMessage();
  const { verifyMfa } = useSessionActions();
  const [mode, setMode] = useState<Mode>('app');
  const [value, setValue] = useState('');
  const [missing, setMissing] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function switchMode(): void {
    setMode(mode === 'app' ? 'recovery' : 'app');
    setValue('');
    setFailure(null);
    setMissing(false);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFailure(null);
    const entered = value.trim();
    if (entered === '') {
      setMissing(true);
      inputRef.current?.focus();
      return;
    }
    setMissing(false);
    const body = mode === 'app' ? { code: entered } : { recoveryCode: entered };
    verifyMfa.mutate(body, {
      onSuccess: () => router.replace('/'),
      onError: (error) => {
        setFailure(error);
        setValue('');
        inputRef.current?.focus();
      },
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{t('mfa.verifyTitle')}</h1>
        <p className="mt-1 text-text-muted">{t('mfa.verifyDescription')}</p>
      </div>

      {failure ? <Alert tone="danger">{errorMessage(failure)}</Alert> : null}

      <Field
        label={mode === 'app' ? t('mfa.codeLabel') : t('mfa.recoveryCodeLabel')}
        required
        error={missing ? t('validation.required') : undefined}
      >
        {({ id, invalid, required, ...aria }) => (
          <TextInput
            id={id}
            ref={inputRef}
            name={mode === 'app' ? 'code' : 'recoveryCode'}
            inputMode={mode === 'app' ? 'numeric' : 'text'}
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={mode === 'app' ? 6 : 20}
            invalid={invalid}
            required={required}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            {...aria}
          />
        )}
      </Field>

      <Button type="submit" size="lg" loading={verifyMfa.isPending}>
        {t('mfa.continue')}
      </Button>
      <Button type="button" variant="ghost" onClick={switchMode}>
        {mode === 'app' ? t('mfa.useRecoveryCode') : t('mfa.useAppCode')}
      </Button>
    </form>
  );
}
