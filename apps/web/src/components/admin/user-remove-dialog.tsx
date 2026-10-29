'use client';
// Remove a person from this hospital (T-ACC-05; FR-ACC-010; UC-ACC-02): the "delete" of the users
// table. Nothing is deleted: the membership is revoked for good, which ends the person's open
// sessions here, while the account and the audit trail stay (ADR-009, append-only history). The
// API needs a reason and refuses an administrator's own account.
import type { AdminUser } from '@hms/contracts';
import { Alert, Button, Dialog, Field, TextInput, useToast } from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { adminApi } from '../../api/admin';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { USERS_QUERY_KEY } from './user-create-dialog';

export function UserRemoveDialog({
  user,
  onOpenChange,
}: {
  user: AdminUser;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [missing, setMissing] = useState(false);

  const remove = useMutation({
    mutationFn: () => adminApi.setMembershipStatus(user.userId, { status: 'REVOKED', reason }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      toast.show({ title: t('admin.removed', { name: user.displayName }), tone: 'success' });
      onOpenChange(false);
    },
  });

  function confirm(): void {
    if (reason.trim() === '') {
      setMissing(true);
      return;
    }
    setMissing(false);
    remove.mutate();
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={t('admin.removeTitle', { name: user.displayName })}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('admin.cancel')}
          </Button>
          <Button variant="danger" loading={remove.isPending} onClick={confirm}>
            {t('admin.removeConfirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {remove.error ? <Alert tone="danger">{errorMessage(remove.error)}</Alert> : null}
        <p>{t('admin.removeDescription')}</p>
        <Field
          label={t('admin.reason')}
          hint={t('admin.reasonHint')}
          required
          error={missing ? t('validation.required') : undefined}
        >
          {({ id, invalid, required, ...aria }) => (
            <TextInput
              id={id}
              value={reason}
              invalid={invalid}
              required={required}
              onChange={(event) => setReason(event.target.value)}
              {...aria}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
