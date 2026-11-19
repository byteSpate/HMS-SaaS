'use client';
// Department worklist (T-ORD-02; FR-LAB-004, FR-BIL-003, FR-ORD-004; UC-BIL-02 "Gate"; ADR-015).
// Today's orders for the department, by category, in three parts: paid orders ready to start,
// orders in progress, and orders awaiting payment with what is still due. The list polls every
// 20 seconds while the tab is visible and refreshes on focus, so an order moves to Ready soon
// after the cashier takes the payment. Start carries an Idempotency-Key per order version; the
// server checks payment again and an unpaid order is refused with the amount due.
// order.service.start; the API enforces it.
import {
  ORDERABLE_CATEGORIES,
  type DepartmentWorklistOrder,
  type OrderableCategory,
} from '@hms/contracts';
import { formatMoney, formatTimeOfDay, type Locale } from '@hms/i18n';
import { Alert, announce, Button, Field, PageLayout, Select, Skeleton } from '@hms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { ApiError, wasRefused } from '../../../src/api/errors';
import { departmentWorklistKey, ordersApi } from '../../../src/api/orders';
import { TOOLBAR } from '../../../src/components/admin/admin-table';
import { DepartmentOrderTable } from '../../../src/components/department/department-order-table';
import { splitWorklist } from '../../../src/components/department/department-rules';
import { CATEGORY_KEYS } from '../../../src/components/services/service-labels';
import { useApiErrorMessage } from '../../../src/i18n/use-api-error-message';

/** ADR-015: 15 to 30 seconds while visible. */
const POLL_MS = 20_000;
const ALL = 'ALL';

export default function DepartmentPage() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const keys = useRef(new Map<string, string>());
  const [category, setCategory] = useState<OrderableCategory | null>(null);

  const worklist = useQuery({
    queryKey: departmentWorklistKey(category),
    queryFn: () => ordersApi.departmentWorklist(category),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['orders', 'worklist'] });

  const start = useMutation({
    mutationFn: (order: DepartmentWorklistOrder) => {
      // One key per order and version: a retry after a lost answer is the same start (SP-08).
      const slot = `${order.orderId}:${order.version}`;
      const key = keys.current.get(slot) ?? crypto.randomUUID();
      keys.current.set(slot, key);
      return ordersApi.start(order.orderId, { expectedVersion: order.version }, key);
    },
    onSuccess: () => {
      announce(t('department.started'));
      void refreshAll();
    },
    onError: (error) => {
      // A refusal saved nothing: the next try gets a new key, on the reloaded list.
      if (wasRefused(error)) {
        keys.current.clear();
        void refreshAll();
      }
    },
  });

  // FR-BIL-003: name what is due and where, so the patient can be sent to the cashier.
  const startError = (error: unknown) => {
    const unpaid = error instanceof ApiError ? error.problem?.lines?.[0] : undefined;
    if (error instanceof ApiError && error.code === 'PAYMENT_NOT_ELIGIBLE' && unpaid) {
      return t('department.notPaid', {
        amount: formatMoney(unpaid.due, locale, { symbol: 'sign' }),
        invoice: unpaid.invoiceNumber,
      });
    }
    return errorMessage(error);
  };

  const lists = splitWorklist(worklist.data ?? []);
  const startingId = start.isPending ? start.variables.orderId : null;

  return (
    <PageLayout
      title={t('department.title')}
      description={t('department.description')}
      actions={
        <>
          {worklist.dataUpdatedAt > 0 ? (
            <span className="text-sm text-text-muted tabular-nums">
              {t('worklist.updated', {
                time: formatTimeOfDay(new Date(worklist.dataUpdatedAt), locale),
              })}
            </span>
          ) : null}
          <Button
            variant="secondary"
            loading={worklist.isFetching}
            onClick={() => void worklist.refetch()}
          >
            {t('worklist.refresh')}
          </Button>
        </>
      }
    >
      <div className={TOOLBAR}>
        <Field label={t('department.category')} className="max-w-xs">
          {(control) => (
            <Select
              {...control}
              value={category ?? ALL}
              options={[
                { value: ALL, label: t('department.categoryAll') },
                ...ORDERABLE_CATEGORIES.map((value) => ({
                  value,
                  label: t(CATEGORY_KEYS[value]),
                })),
              ]}
              onChange={(event) =>
                setCategory(
                  event.target.value === ALL ? null : (event.target.value as OrderableCategory),
                )
              }
            />
          )}
        </Field>
      </div>
      <div className="flex flex-col gap-8">
        {worklist.error ? <Alert tone="danger">{errorMessage(worklist.error)}</Alert> : null}
        {start.error ? <Alert tone="danger">{startError(start.error)}</Alert> : null}
        {worklist.isPending ? <Skeleton className="h-40" /> : null}
        {worklist.data ? (
          <>
            <section aria-labelledby="department-ready" className="flex flex-col gap-3">
              <h2 id="department-ready" className="text-lg font-semibold">
                {t('department.readyTitle')}
              </h2>
              <DepartmentOrderTable
                orders={lists.ready}
                emptyText={t('department.readyEmpty')}
                showDue={false}
                onStart={(order) => start.mutate(order)}
                startingId={startingId}
              />
            </section>
            <section aria-labelledby="department-in-progress" className="flex flex-col gap-3">
              <h2 id="department-in-progress" className="text-lg font-semibold">
                {t('department.inProgressTitle')}
              </h2>
              <DepartmentOrderTable
                orders={lists.inProgress}
                emptyText={t('department.inProgressEmpty')}
                showDue={false}
              />
            </section>
            <section aria-labelledby="department-awaiting" className="flex flex-col gap-3">
              <div>
                <h2 id="department-awaiting" className="text-lg font-semibold">
                  {t('department.awaitingTitle')}
                </h2>
                <p className="text-sm text-text-muted">{t('department.awaitingHint')}</p>
              </div>
              <DepartmentOrderTable
                orders={lists.awaitingPayment}
                emptyText={t('department.awaitingEmpty')}
                showDue
              />
            </section>
          </>
        ) : null}
      </div>
    </PageLayout>
  );
}
