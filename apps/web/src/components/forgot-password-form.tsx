'use client';
// Signed-out request for a new password (C-093, FR-ACC-012). The confirmation is worded for both
// outcomes, because the API answers the same whether or not the username exists. The administrator
// sees the request on the users screen and sets a temporary password (FR-ACC-007).
import { forgotPasswordRequestSchema } from '@hms/contracts';
import { Alert, Button, buttonClassName, Field, TextInput } from '@hms/ui';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { authApi } from '../api/auth';
import { useApiErrorMessage } from '../i18n/use-api-error-message';

export function ForgotPasswordForm() {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const [username, setUsername] = useState('');
  const [missing, setMissing] = useState(false);
  const request = useMutation({ mutationFn: authApi.requestPasswordReset });

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = forgotPasswordRequestSchema.safeParse({ username });
    setMissing(!parsed.success);
    if (parsed.success) request.mutate(parsed.data);
  }

  const backToSignIn = (
    <Link href="/login" className={buttonClassName('ghost')}>
      {t('forgot.back')}
    </Link>
  );

  if (request.isSuccess) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-semibold">{t('forgot.sentTitle')}</h1>
        <Alert tone="success">{t('forgot.sentBody')}</Alert>
        {backToSignIn}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{t('forgot.title')}</h1>
        <p className="mt-1 text-text-muted">{t('forgot.description')}</p>
      </div>

      {request.error ? <Alert tone="danger">{errorMessage(request.error)}</Alert> : null}

      <Field
        label={t('login.usernameLabel')}
        required
        error={missing ? t('validation.required') : undefined}
      >
        {({ id, invalid, required, ...aria }) => (
          <TextInput
            id={id}
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

      <Button type="submit" size="lg" loading={request.isPending}>
        {request.isPending ? t('forgot.submitting') : t('forgot.submit')}
      </Button>
      {backToSignIn}
    </form>
  );
}
