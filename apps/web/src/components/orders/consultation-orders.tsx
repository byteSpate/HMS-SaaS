'use client';
// Orders on the consultation screen (T-ORD-01; UC-CLI-01 step 3; FR-ORD-002..005, FR-ORD-008):
// the doctor adds services for the visit and sees each order's status and payment. The orders go
// on the visit's service invoice; the patient pays them at the cashier (FR-ORD-005).
// Shown with order.service.create; the API enforces it.
import { Alert, Skeleton, useToast } from '@hms/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { consultationOrdersKey, ordersApi } from '../../api/orders';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { OrderEntry } from './order-entry';
import { OrderList } from './order-list';

export function ConsultationOrders({ consultationId }: { consultationId: string }) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const orders = useQuery({
    queryKey: consultationOrdersKey(consultationId),
    queryFn: () => ordersApi.forConsultation(consultationId),
  });
  return (
    <section aria-labelledby="orders-title" className="flex flex-col gap-4">
      <h2 id="orders-title" className="text-lg font-semibold">
        {t('orders.title')}
      </h2>
      <OrderEntry
        direct={false}
        place={async (body, key) => {
          const next = await ordersApi.placeForConsultation(consultationId, body, key);
          queryClient.setQueryData(consultationOrdersKey(consultationId), next);
        }}
        onPlaced={() => toast.show({ title: t('orders.placed'), tone: 'success' })}
      />
      {orders.error ? <Alert tone="danger">{errorMessage(orders.error)}</Alert> : null}
      {orders.data ? <OrderList orders={orders.data} /> : null}
      {orders.isPending ? <Skeleton className="h-24" /> : null}
    </section>
  );
}
