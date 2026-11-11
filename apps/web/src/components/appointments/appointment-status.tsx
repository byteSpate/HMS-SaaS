'use client';
// An appointment's status as a badge (T-SCH-02; FR-SCH-002..005), the same on the patient record and
// in a session's patient list.
import type { AppointmentStatus } from '@hms/contracts';
import { StatusBadge, type StatusBadgeProps } from '@hms/ui';
import { useTranslations } from 'next-intl';

// Full catalog keys as literals, so the unused-key check can see them.
const STATUS: Record<
  AppointmentStatus,
  { labelKey: `appointments.status${AppointmentStatus}`; badge: StatusBadgeProps['status'] }
> = {
  BOOKED: { labelKey: 'appointments.statusBOOKED', badge: 'active' },
  CHECKED_IN: { labelKey: 'appointments.statusCHECKED_IN', badge: 'done' },
  RESCHEDULED: { labelKey: 'appointments.statusRESCHEDULED', badge: 'idle' },
  CANCELLED: { labelKey: 'appointments.statusCANCELLED', badge: 'idle' },
  NO_SHOW: { labelKey: 'appointments.statusNO_SHOW', badge: 'attention' },
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const t = useTranslations();
  const { labelKey, badge } = STATUS[status];
  return <StatusBadge size="sm" status={badge} label={t(labelKey)} />;
}
