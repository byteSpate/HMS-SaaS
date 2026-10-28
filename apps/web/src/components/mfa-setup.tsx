'use client';
// First-time set-up of the second factor for a privileged role (T-ACC-04; FR-ACC-006; C-032):
// show the key as a QR code and as text, confirm it with the first code, then show the ten
// recovery codes once. The confirmed session is cached only after the codes are acknowledged,
// so the route guard does not leave this screen while they are on it.
import type { MfaConfirmResponse } from '@hms/contracts';
import { Alert, Button, Field, TextInput } from '@hms/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
import { authApi } from '../api/auth';
import { useApiErrorMessage } from '../i18n/use-api-error-message';
import { useSessionActions } from '../session/use-session';
import { QrCode } from './qr-code';

/** "JBSWY3DP..." in groups of four, the way authenticator apps show keys. */
function groupKey(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
}

export function MfaSetup() {
  const t = useTranslations();
  const router = useRouter();
  const errorMessage = useApiErrorMessage();
  const { confirmMfa, keep } = useSessionActions();
  const enrolment = useMutation({ mutationFn: () => authApi.startMfaEnrolment() });
  const [code, setCode] = useState('');
  const [missing, setMissing] = useState(false);
  const [confirmed, setConfirmed] = useState<MfaConfirmResponse | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const failure = enrolment.error ?? confirmMfa.error;

  function onConfirm(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (code.trim() === '') {
      setMissing(true);
      codeRef.current?.focus();
      return;
    }
    setMissing(false);
    confirmMfa.mutate(code.trim(), {
      onSuccess: setConfirmed,
      onError: () => {
        setCode('');
        codeRef.current?.focus();
      },
    });
  }

  function finish(): void {
    if (!confirmed) return;
    keep(confirmed.session);
    router.replace('/');
  }

  if (confirmed) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold">{t('mfa.recoveryTitle')}</h1>
          <p className="mt-1 text-text-muted">{t('mfa.recoveryDescription')}</p>
        </div>
        <ul className="grid grid-cols-2 gap-2 font-mono text-base" data-testid="recovery-codes">
          {confirmed.recoveryCodes.map((recoveryCode) => (
            <li key={recoveryCode} className="rounded border border-border px-2 py-1">
              {recoveryCode}
            </li>
          ))}
        </ul>
        <Button size="lg" onClick={finish}>
          {t('mfa.recoverySaved')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{t('mfa.setupTitle')}</h1>
        <p className="mt-1 text-text-muted">{t('mfa.setupDescription')}</p>
      </div>

      {failure ? <Alert tone="danger">{errorMessage(failure)}</Alert> : null}

      {enrolment.data ? (
        <form onSubmit={onConfirm} noValidate className="flex flex-col gap-5">
          <p>{t('mfa.scanCode')}</p>
          <div className="self-center">
            <QrCode value={enrolment.data.otpauthUri} label={t('mfa.qrLabel')} />
          </div>
          <div>
            <p className="text-text-muted">{t('mfa.manualKey')}</p>
            <p className="mt-1 font-mono text-base break-all" data-testid="mfa-secret">
              {groupKey(enrolment.data.secret)}
            </p>
          </div>
          <Field
            label={t('mfa.codeLabel')}
            required
            error={missing ? t('validation.required') : undefined}
          >
            {({ id, invalid, required, ...aria }) => (
              <TextInput
                id={id}
                ref={codeRef}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                invalid={invalid}
                required={required}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                {...aria}
              />
            )}
          </Field>
          <Button type="submit" size="lg" loading={confirmMfa.isPending}>
            {t('mfa.turnOn')}
          </Button>
        </form>
      ) : (
        <Button size="lg" loading={enrolment.isPending} onClick={() => enrolment.mutate()}>
          {t('mfa.startSetup')}
        </Button>
      )}
    </div>
  );
}
