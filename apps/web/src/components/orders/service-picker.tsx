'use client';
// Find a service to order (T-ORD-01; FR-ORD-001, FR-ORD-008): type-ahead over the services the
// price list in force prices; reception sees only the directly orderable ones. Enter or a click
// adds the service and empties the box, so entry continues without leaving the keyboard.
import type { OrderableService } from '@hms/contracts';
import { formatMoney, type Locale } from '@hms/i18n';
import { Combobox, type ComboboxOption } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { orderableServicesKey, ordersApi } from '../../api/orders';
import { useDebouncedValue } from '../patients/use-debounced-value';
import { serviceName } from '../services/service-form';

export function ServicePicker({
  direct,
  onPick,
}: {
  /** Reception's picker: only directly orderable services (FR-ORD-001). */
  direct: boolean;
  onPick: (service: OrderableService) => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [term, setTerm] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const settled = useDebouncedValue(term.trim(), 200);
  const results = useQuery({
    queryKey: orderableServicesKey(settled, direct),
    queryFn: () => ordersApi.services(settled, direct),
    enabled: settled.length > 0,
    retry: false,
  });
  const services = settled.length > 0 ? (results.data ?? []) : [];
  const options: ComboboxOption[] = services.map((service) => ({
    id: service.serviceItemId,
    label: `${service.code} - ${serviceName(service, locale)}`,
    description: formatMoney(service.unitPrice, locale, { symbol: 'sign' }),
  }));

  function pick(option: ComboboxOption | null): void {
    const service = services.find((row) => row.serviceItemId === option?.id);
    if (!service) return;
    onPick(service);
    setTerm('');
    setResetKey((key) => key + 1);
  }

  return (
    <Combobox
      key={resetKey}
      autoFocus={resetKey > 0}
      aria-label={t('orders.searchLabel')}
      placeholder={t('orders.searchPlaceholder')}
      options={options}
      minQueryLength={1}
      loading={settled.length > 0 && (results.isFetching || settled !== term.trim())}
      listLabel={t('orders.searchList')}
      emptyLabel={direct ? t('orders.searchEmptyDirect') : t('orders.searchEmpty')}
      loadingLabel={t('orders.searchLoading')}
      announceResults={(count) => t('orders.searchResults', { count })}
      onQueryChange={setTerm}
      onValueChange={pick}
    />
  );
}
