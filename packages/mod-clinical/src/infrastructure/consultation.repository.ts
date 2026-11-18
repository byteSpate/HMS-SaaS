// Consultation rows, and the visit reads the worklist needs, in PostgreSQL (T-CLI-01; E section 3).
// Every function runs in the caller's withTenant() transaction, so RLS limits it to one hospital
// (ADR-003).
import type { TenantTx } from '@hms/database';
import type { ConsultationStatus } from '../domain/worklist.js';

export interface WorklistVisit {
  visitId: string;
  appointmentId: string;
  version: number;
  queueNumber: number | null;
  arrivedAt: Date;
  consultation: { consultationId: string; status: ConsultationStatus } | null;
}

/** The visits of these appointments, with their consultation; cancelled visits are left out. */
export async function findVisitsOfAppointments(
  tx: TenantTx,
  appointmentIds: readonly string[],
): Promise<Map<string, WorklistVisit>> {
  if (appointmentIds.length === 0) return new Map();
  const rows = await tx.visit.findMany({
    where: { appointmentId: { in: [...appointmentIds] }, status: { not: 'CANCELLED' } },
    select: {
      id: true,
      appointmentId: true,
      version: true,
      queueNumber: true,
      arrivedAt: true,
      consultation: { select: { id: true, status: true } },
    },
  });
  const visits = new Map<string, WorklistVisit>();
  for (const row of rows) {
    if (!row.appointmentId) continue;
    visits.set(row.appointmentId, {
      visitId: row.id,
      appointmentId: row.appointmentId,
      version: row.version,
      queueNumber: row.queueNumber,
      arrivedAt: row.arrivedAt,
      consultation: row.consultation
        ? {
            consultationId: row.consultation.id,
            status: row.consultation.status as ConsultationStatus,
          }
        : null,
    });
  }
  return visits;
}

export interface StartableVisit {
  patientId: string;
  kind: string;
  status: string;
  attendingPractitionerId: string | null;
  version: number;
  consultationExists: boolean;
}

export async function findStartableVisit(
  tx: TenantTx,
  visitId: string,
): Promise<StartableVisit | null> {
  const row = await tx.visit.findUnique({
    where: { id: visitId },
    select: {
      patientId: true,
      kind: true,
      status: true,
      attendingPractitionerId: true,
      version: true,
      consultation: { select: { id: true } },
    },
  });
  if (!row) return null;
  const { consultation, ...visit } = row;
  return { ...visit, consultationExists: consultation !== null };
}

/**
 * Moves the visit to its next version only if it is still at `expectedVersion` (SP-03). The
 * UPDATE locks the row, so of two starts at once the second finds 0 rows and gets STALE_RECORD.
 */
export async function bumpVisitVersion(
  tx: TenantTx,
  target: { visitId: string; expectedVersion: number; at: Date },
): Promise<number> {
  const result = await tx.visit.updateMany({
    where: { id: target.visitId, version: target.expectedVersion },
    data: { version: { increment: 1 }, updatedAt: target.at },
  });
  return result.count;
}

export interface StoredConsultation {
  consultationId: string;
  visitId: string;
  patientId: string;
  practitionerId: string;
  status: ConsultationStatus;
  startedAt: Date;
  version: number;
}

const CONSULTATION = {
  id: true,
  visitId: true,
  practitionerId: true,
  status: true,
  startedAt: true,
  version: true,
  visit: { select: { patientId: true } },
} as const;

type ConsultationRow = {
  id: string;
  visitId: string;
  practitionerId: string;
  status: string;
  startedAt: Date;
  version: number;
  visit: { patientId: string };
};

const toStored = (row: ConsultationRow): StoredConsultation => ({
  consultationId: row.id,
  visitId: row.visitId,
  patientId: row.visit.patientId,
  practitionerId: row.practitionerId,
  status: row.status as ConsultationStatus,
  startedAt: row.startedAt,
  version: row.version,
});

export async function insertConsultation(
  tx: TenantTx,
  values: { tenantId: string; visitId: string; practitionerId: string; userId: string; at: Date },
): Promise<StoredConsultation> {
  const row = await tx.consultation.create({
    data: {
      tenantId: values.tenantId,
      visitId: values.visitId,
      practitionerId: values.practitionerId,
      startedAt: values.at,
      startedBy: values.userId,
      updatedAt: values.at,
    },
    select: CONSULTATION,
  });
  return toStored(row);
}

/** The consultation if it is this practitioner's (the signed-in doctor's own), else null. */
export async function findConsultationOf(
  tx: TenantTx,
  consultationId: string,
  practitionerId: string,
): Promise<StoredConsultation | null> {
  const row = await tx.consultation.findFirst({
    where: { id: consultationId, practitionerId },
    select: CONSULTATION,
  });
  return row ? toStored(row) : null;
}
