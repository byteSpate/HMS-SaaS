'use client';
// Services (T-ORD-01; FR-ORD-001, FR-ORD-007, FR-CFG-001): the hospital's orderable tests,
// imaging and procedures, active first, by category and code, with whether reception may order
// them directly and the expected report time. Prices are set on the price list screen.
// admin.price.publish; the API enforces it.
import type { ServiceRecord } from '@hms/contracts';
import { toLocaleDigits, type Locale } from '@hms/i18n';
import { Button, IconButton, PageLayout, StatusBadge } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { SERVICES_QUERY_KEY, servicesApi } from '../../../../src/api/services';
import {
  CELL,
  HEAD_CELL,
  ROW,
  ROW_TITLE,
  TABLE,
  TABLE_FRAME,
} from '../../../../src/components/admin/admin-table';
import { QueryView } from '../../../../src/components/query-view';
import { ServiceDialog } from '../../../../src/components/services/service-dialog';
import { serviceName } from '../../../../src/components/services/service-form';
import { CATEGORY_KEYS } from '../../../../src/components/services/service-labels';

type OpenDialog = { kind: 'add' } | { kind: 'edit'; serviceItemId: string } | null;

function ServiceRow({ service, onEdit }: { service: ServiceRecord; onEdit: () => void }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const name = serviceName(service, locale);
  return (
    <tr className={ROW}>
      <td className={`${CELL} font-mono`}>{service.code}</td>
      <td className={CELL} data-label={t('services.columnName')}>
        <p className={ROW_TITLE}>{name}</p>
        <p className="text-[0.6875rem] text-text-muted">{t(CATEGORY_KEYS[service.category])}</p>
      </td>
      <td className={CELL} data-label={t('services.columnDirect')}>
        {service.directlyOrderable ? t('services.directYes') : t('services.directNo')}
      </td>
      <td className={`${CELL} tabular-nums`} data-label={t('services.columnReport')}>
        {service.reportHours === null
          ? t('services.noReport')
          : t('services.hours', { hours: toLocaleDigits(String(service.reportHours), locale) })}
      </td>
      <td className={CELL} data-label={t('services.columnStatus')}>
        {service.active ? (
          <StatusBadge size="sm" status="active" label={t('services.statusActive')} />
        ) : (
          <StatusBadge size="sm" status="idle" label={t('services.statusInactive')} />
        )}
      </td>
      <td className={`${CELL} text-end`} data-cell="actions">
        <IconButton
          icon="pencil"
          label={`${t('services.edit')}: ${service.code}`}
          variant="secondary"
          onClick={onEdit}
        />
      </td>
    </tr>
  );
}

export default function ServicesPage() {
  const t = useTranslations();
  const services = useQuery({ queryKey: SERVICES_QUERY_KEY, queryFn: servicesApi.list });
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const editing =
    dialog?.kind === 'edit'
      ? services.data?.find((row) => row.serviceItemId === dialog.serviceItemId)
      : undefined;
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };
  const HEADS = [
    { key: 'services.columnCode', align: 'text-start' },
    { key: 'services.columnName', align: 'text-start' },
    { key: 'services.columnDirect', align: 'text-start' },
    { key: 'services.columnReport', align: 'text-start' },
    { key: 'services.columnStatus', align: 'text-start' },
    { key: 'services.columnActions', align: 'text-end' },
  ] as const;

  return (
    <PageLayout
      title={t('services.title')}
      description={t('services.description')}
      actions={<Button onClick={() => setDialog({ kind: 'add' })}>{t('services.add')}</Button>}
    >
      <QueryView
        query={services}
        isEmpty={(rows) => rows.length === 0}
        empty={{ title: t('services.empty'), hint: t('services.emptyHint') }}
        columns={6}
      >
        {(rows) => (
          <div className={TABLE_FRAME}>
            <table className={TABLE}>
              <thead>
                <tr>
                  {HEADS.map((head) => (
                    <th key={head.key} scope="col" className={`${HEAD_CELL} ${head.align}`}>
                      {t(head.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((service) => (
                  <ServiceRow
                    key={service.serviceItemId}
                    service={service}
                    onEdit={() => setDialog({ kind: 'edit', serviceItemId: service.serviceItemId })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
      {dialog?.kind === 'add' ? <ServiceDialog onOpenChange={close} /> : null}
      {editing ? (
        <ServiceDialog
          key={`${editing.serviceItemId}:${editing.version}`}
          service={editing}
          onOpenChange={close}
        />
      ) : null}
    </PageLayout>
  );
}
