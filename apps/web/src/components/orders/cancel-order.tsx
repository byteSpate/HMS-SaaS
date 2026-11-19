'use client';
// Cancel an order (T-ORD-03; UC-ORD-02 interim rule; FR-ORD-006): offered only while the order is
// REQUESTED and unpaid, with a mandatory reason. The API checks again; a paid order answers
// FEATURE_NOT_AVAILABLE, shown in the dialog. After cancelling, the order and its line stay
// visible as cancelled.
import type { ServiceOrder } from '@hms/contracts';
import type { Locale } from '@hms/i18n';
import { Alert, Button, Dialog, Field, IconButton, TextArea, useToast } from '@hms/ui';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ordersApi } from '../../api/orders';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { serviceName } from '../services/service-form';
import { paymentStateOf } from './order-rules';

/** The API's rule: at least three characters (cancelOrderRequestSchema). */
const MIN_REASON = 3;

/** The interim rule as the screen sees it; the API decides. */
export const cancellable = (order: ServiceOrder) =>
  order.status === 'REQUESTED' && paymentStateOf(order) === 'UNPAID';

function CancelDialog({
  order,
  onCancelled,
  onOpenChange,
}: {
  order: ServiceOrder;
  onCancelled: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const [reason, setReason] = useState('');
  const [key] = useState(() => crypto.randomUUID());
  const cancel = useMutation({
    mutationFn: () =>
      ordersApi.cancel(
        order.orderId,
        { reason: reason.trim(), expectedVersion: order.version },
        key,
      ),
    onSuccess: () => {
      toast.show({ title: t('orders.cancelled'), tone: 'success' });
      onCancelled();
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={t('orders.cancelTitle', { name: serviceName(order.service, locale) })}
      description={t('orders.cancelBody')}
      footer={
        <Button
          loading={cancel.isPending}
          disabled={reason.trim().length < MIN_REASON}
          onClick={() => cancel.mutate()}
        >
          {t('orders.cancelSubmit')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {cancel.error ? <Alert tone="danger">{errorMessage(cancel.error)}</Alert> : null}
        <Field label={t('orders.cancelReason')} required>
          {({ id, ...aria }) => (
            <TextArea
              id={id}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              {...aria}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/** The row action: a cancel button for a cancellable order, and its dialog. */
export function CancelOrderAction({
  order,
  onCancelled,
}: {
  order: ServiceOrder;
  onCancelled: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  if (!cancellable(order)) return null;
  return (
    <>
      <IconButton
        icon="close"
        variant="secondary"
        label={`${t('orders.cancel')}: ${serviceName(order.service, locale)}`}
        onClick={() => setOpen(true)}
      />
      {open ? (
        <CancelDialog order={order} onCancelled={onCancelled} onOpenChange={setOpen} />
      ) : null}
    </>
  );
}
