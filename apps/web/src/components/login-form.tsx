'use client';
// Sign-in form (SCR-01, UC-ACC-01, FR-ACC-001). Plain state is enough for two fields; the
// shared contract validates on submit and the API re-validates. Messages are kept as data (which
// field, which error) and turned into text at render, so switching language re-translates them
// without clearing what the person typed (FR-I18N-001, AT-I18N-001). Implements: T-UI-02.
import { loginRequestSchema } from '@hms/contracts';
import { Alert, Button, buttonClassName, Field, PasswordInput, TextInput } from '@hms/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
import { useApiErrorMessage } from '../i18n/use-api-error-message';
import { useSessionActions } from '../session/use-session';
import { HospitalCodeField, rememberHospitalCode, useHospitalCode } from './hospital-code-field';

interface Missing {
  hospitalCode: boolean;
  username: boolean;
  password: boolean;
}

const NOTHING_MISSING: Missing = { hospitalCode: false, username: false, password: false };

export function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const errorMessage = useApiErrorMessage();
  const { login } = useSessionActions();
  const [hospitalCode, setHospitalCode] = useHospitalCode();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [missing, setMissing] = useState<Missing>(NOTHING_MISSING);
  const [failure, setFailure] = useState<unknown>(null);
  const hospitalCodeRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFailure(null);
    const parsed = loginRequestSchema.safeParse({ hospitalCode, username, password });
    if (!parsed.success) {
      const next = {
        hospitalCode: hospitalCode.trim() === '',
        username: username.trim() === '',
        password: password === '',
      };
      setMissing(next);
      const order = [
        { missing: next.hospitalCode, ref: hospitalCodeRef },
        { missing: next.username, ref: usernameRef },
        { missing: next.password, ref: passwordRef },
      ];
      order.find((field) => field.missing)?.ref.current?.focus();
      return;
    }
    setMissing(NOTHING_MISSING);
    login.mutate(parsed.data, {
      onSuccess: (session) => {
        rememberHospitalCode(parsed.data.hospitalCode);
        router.replace(session.activeMembershipId ? '/' : '/login');
      },
      onError: (error) => {
        setFailure(error);
        // The password is never kept after a failed attempt.
        setPassword('');
        passwordRef.current?.focus();
      },
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{t('login.title')}</h1>
        <p className="mt-1 text-text-muted">{t('login.description')}</p>
      </div>

      {failure ? <Alert tone="danger">{errorMessage(failure)}</Alert> : null}

      <HospitalCodeField
        value={hospitalCode}
        onChange={setHospitalCode}
        missing={missing.hospitalCode}
        inputRef={hospitalCodeRef}
      />

      <Field
        label={t('login.usernameLabel')}
        required
        error={missing.username ? t('validation.required') : undefined}
      >
        {({ id, invalid, required, ...aria }) => (
          <TextInput
            id={id}
            ref={usernameRef}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            invalid={invalid}
            required={required}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            {...aria}
          />
        )}
      </Field>

      <Field
        label={t('login.passwordLabel')}
        required
        error={missing.password ? t('validation.required') : undefined}
      >
        {({ id, invalid, required, ...aria }) => (
          <PasswordInput
            id={id}
            ref={passwordRef}
            name="password"
            showLabel={t('common.showSecret')}
            hideLabel={t('common.hideSecret')}
            autoComplete="current-password"
            invalid={invalid}
            required={required}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            {...aria}
          />
        )}
      </Field>

      <Button type="submit" size="lg" loading={login.isPending}>
        {login.isPending ? t('login.submitting') : t('login.submit')}
      </Button>

      <Link href="/forgot-password" className={buttonClassName('ghost')}>
        {t('login.forgotLink')}
      </Link>
    </form>
  );
}
