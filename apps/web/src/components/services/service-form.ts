// The service dialog's form state and the request it sends (T-ORD-01; FR-ORD-001, FR-ORD-007,
// FR-I18N-006). Pure, so the rules are tested without rendering. The code is shown and sent upper
// case; a blank name is sent as null; a blank report time means the service has no report.
import type { OrderableCategory, ServiceRecord } from '@hms/contracts';
import { ApiError } from '../../api/errors';

export interface ServiceForm {
  code: string;
  category: OrderableCategory;
  nameBn: string;
  nameEn: string;
  directlyOrderable: boolean;
  reportHours: string;
  active: boolean;
}

const CODE_PATTERN = /^[A-Z][A-Z0-9_-]{0,39}$/;

export function serviceFormOf(service?: ServiceRecord): ServiceForm {
  return {
    code: service?.code ?? '',
    category: service?.category ?? 'LAB',
    nameBn: service?.nameBn ?? '',
    nameEn: service?.nameEn ?? '',
    directlyOrderable: service?.directlyOrderable ?? false,
    reportHours: service?.reportHours === null || !service ? '' : String(service.reportHours),
    active: service?.active ?? true,
  };
}

const text = (value: string) => (value.trim() === '' ? null : value.trim());

/** Hours 1-720, null when blank, undefined when not a valid number. */
export function reportHoursOf(form: ServiceForm): number | null | undefined {
  const value = form.reportHours.trim();
  if (value === '') return null;
  if (!/^\d{1,3}$/.test(value)) return undefined;
  const hours = Number(value);
  return hours >= 1 && hours <= 720 ? hours : undefined;
}

export function serviceFieldsOf(form: ServiceForm) {
  return {
    nameBn: text(form.nameBn),
    nameEn: text(form.nameEn),
    directlyOrderable: form.directlyOrderable,
    reportHours: reportHoursOf(form) ?? null,
  };
}

export function hasValidServiceCode(form: ServiceForm): boolean {
  return CODE_PATTERN.test(form.code.trim().toUpperCase());
}

/** A name in one script, a valid report time, and for a new service a valid code. */
export function isServiceComplete(form: ServiceForm, isNew: boolean): boolean {
  const fields = serviceFieldsOf(form);
  return (
    (fields.nameBn !== null || fields.nameEn !== null) &&
    reportHoursOf(form) !== undefined &&
    (!isNew || hasValidServiceCode(form))
  );
}

export function serviceDiffers(service: ServiceRecord, form: ServiceForm): boolean {
  const fields = serviceFieldsOf(form);
  return (
    form.active !== service.active ||
    (Object.keys(fields) as (keyof typeof fields)[]).some(
      (field) => fields[field] !== service[field],
    )
  );
}

/** The API refused the code because another item of the hospital has it. */
export function isCodeTaken(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.code === 'VALIDATION_FAILED' &&
    (error.problem?.fields ?? []).some((field) => field.path === 'code')
  );
}

/** How screens name a service: the name in the screen's language, else the other, else code. */
export function serviceName(
  service: { code: string; nameBn: string | null; nameEn: string | null },
  locale: string,
): string {
  const preferred = locale === 'bn-BD' ? service.nameBn : service.nameEn;
  return preferred ?? service.nameEn ?? service.nameBn ?? service.code;
}
