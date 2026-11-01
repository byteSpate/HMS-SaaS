'use client';
// The user's own password change (T-ACC-05; FR-ACC-007; UC-ACC-01 A1). Also the forced step
// after an administrator set a temporary password. The API checks the current password and the
// product minimums; the form only checks that both new entries match. Passwords are never kept
// after a failed attempt.
import { PASSWORD_MIN_LENGTH } from '@hms/contracts';
import { Alert, Button, Field, PasswordInput, useToast } from '@hms/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useApiErrorMessage } from '../i18n/use-api-error-message';
import { useSessionActions } from '../session/use-session';

type Problem = 'required' | 'mismatch' | null;

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const { changePassword } = useSessionActions();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [problem, setProblem] = useState<Problem>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (current === '' || next === '' || repeat === '') {
      setProblem('required');
      return;
    }
    if (next !== repeat) {
      setProblem('mismatch');
      return;
    }
    setProblem(null);
    changePassword.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          toast.show({ title: t('changePassword.changed'), tone: 'success' });
          router.replace('/');
        },
        onError: () => {
          setCurrent('');
          setNext('');
          setRepeat('');
        },
      },
    );
  }

  const fields = [
    { id: 'current', label: t('changePassword.current'), value: current, set: setCurrent },
    { id: 'next', label: t('changePassword.next'), value: next, set: setNext },
    { id: 'repeat', label: t('changePassword.repeat'), value: repeat, set: setRepeat },
  ] as const;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{t('changePassword.title')}</h1>
        <p className="mt-1 text-text-muted">{t('changePassword.description')}</p>
      </div>
      {forced ? <Alert tone="info">{t('changePassword.forced')}</Alert> : null}
      {changePassword.error ? (
        <Alert tone="danger">{errorMessage(changePassword.error)}</Alert>
      ) : null}
      {problem === 'mismatch' ? <Alert tone="danger">{t('changePassword.mismatch')}</Alert> : null}

      {fields.map((field) => (
        <Field
          key={field.id}
          label={field.label}
          required
          error={
            problem === 'required' && field.value === '' ? t('validation.required') : undefined
          }
        >
          {({ id, invalid, required, ...aria }) => (
            <PasswordInput
              id={id}
              name={field.id}
              showLabel={t('common.showSecret')}
              hideLabel={t('common.hideSecret')}
              autoComplete={field.id === 'current' ? 'current-password' : 'new-password'}
              minLength={field.id === 'current' ? undefined : PASSWORD_MIN_LENGTH}
              invalid={invalid}
              required={required}
              value={field.value}
              onChange={(event) => field.set(event.target.value)}
              {...aria}
            />
          )}
        </Field>
      ))}

      <Button type="submit" size="lg" loading={changePassword.isPending}>
        {t('changePassword.submit')}
      </Button>
    </form>
  );
}
