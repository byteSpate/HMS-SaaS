'use client';
// Reception's orders for a patient (T-VIS-02, T-ORD-03; UC-VIS-02 diagnostic path; UC-ORD-02):
// a diagnostic visit is opened with directly orderable tests picked one after another
// (FR-ORD-001, FR-ORD-008), and the patient's orders in open visits are listed with their
// payment state and, with order.service.cancel, a cancel action. The patient then pays at the
// cashier. Needs visit.create and order.direct_diagnostic.create; the API enforces both.
import type { ServiceOrder } from '@hms/contracts';
import { Alert, Skeleton, useToast } from '@hms/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ordersApi, patientOrdersKey } from '../../api/orders';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { CancelOrderAction } from './cancel-order';
import { OrderEntry } from './order-entry';
import { OrderList } from './order-list';

export function PatientOrders({ patientId, canCancel }: { patientId: string; canCancel: boolean }) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const orders = useQuery({
    queryKey: patientOrdersKey(patientId),
    queryFn: () => ordersApi.forPatient(patientId),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: patientOrdersKey(patientId) });
  const cancelAction = canCancel
    ? (order: ServiceOrder) => (
        <CancelOrderAction order={order} onCancelled={() => void refresh()} />
      )
    : undefined;
  return (
    <section aria-labelledby="patient-orders-title" className="flex flex-col gap-4">
      <div>
        <h2 id="patient-orders-title" className="text-lg font-semibold">
          {t('orders.directTitle')}
        </h2>
        <p className="text-sm text-text-muted">{t('orders.directHint')}</p>
      </div>
      <OrderEntry
        direct
        place={(body, key) =>
          ordersApi.createDiagnosticVisit({ patientId, items: body.items }, key)
        }
        onPlaced={() => {
          void refresh();
          toast.show({ title: t('orders.placed'), tone: 'success' });
        }}
      />
      {orders.error ? <Alert tone="danger">{errorMessage(orders.error)}</Alert> : null}
      {orders.isPending ? <Skeleton className="h-24" /> : null}
      {orders.data ? <OrderList orders={orders.data} action={cancelAction} /> : null}
    </section>
  );
}
