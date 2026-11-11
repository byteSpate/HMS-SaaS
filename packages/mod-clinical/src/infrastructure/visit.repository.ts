// Visit rows in PostgreSQL (T-VIS-01; E section 5.3). Every function runs in the caller's
// withTenant() transaction, so RLS limits it to one hospital (ADR-003).
import type { TenantTx } from '@hms/database';

export interface NewConsultationVisit {
  tenantId: string;
  facilityId: string;
  departmentId: string | null;
  patientId: string;
  practitionerId: string;
  appointmentId: string;
  sessionId: string;
  queueNumber: number;
  userId: string;
  at: Date;
}

export async function insertConsultationVisit(
  tx: TenantTx,
  values: NewConsultationVisit,
): Promise<{ id: string; status: string; arrivedAt: Date }> {
  return tx.visit.create({
    data: {
      tenantId: values.tenantId,
      facilityId: values.facilityId,
      departmentId: values.departmentId,
      patientId: values.patientId,
      kind: 'OPD_CONSULTATION',
      attendingPractitionerId: values.practitionerId,
      appointmentId: values.appointmentId,
      scheduleSessionId: values.sessionId,
      queueNumber: values.queueNumber,
      arrivedAt: values.at,
      createdBy: values.userId,
      updatedAt: values.at,
    },
    select: { id: true, status: true, arrivedAt: true },
  });
}

/** C-041: when the patient last saw this doctor, before now; a cancelled visit does not count. */
export async function lastConsultationAt(
  tx: TenantTx,
  patientId: string,
  practitionerId: string,
): Promise<Date | null> {
  const row = await tx.visit.findFirst({
    where: {
      patientId,
      attendingPractitionerId: practitionerId,
      kind: 'OPD_CONSULTATION',
      status: { not: 'CANCELLED' },
    },
    orderBy: { arrivedAt: 'desc' },
    select: { arrivedAt: true },
  });
  return row?.arrivedAt ?? null;
}
