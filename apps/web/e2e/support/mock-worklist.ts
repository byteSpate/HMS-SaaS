// In-memory stand-in for the doctor worklist endpoints (T-CLI-01), answering with payloads that
// satisfy the shared contracts. The list carries an ETag and answers 304 to a matching
// If-None-Match, like the real API (ADR-015). Tests change it with pay() and unlink(). The real
// rules (eligibility, version checks, RLS) are covered by apps/api/src/worklist.api.spec.ts.
// Names are synthetic.
import {
  consultationSchema,
  doctorWorklistSchema,
  startConsultationRequestSchema,
  type Consultation,
  type WorklistEntry,
} from '@hms/contracts';

const ID = (n: number): string => `0199e0c0-0000-7000-8000-${String(n).padStart(12, '0')}`;

export interface WorklistAnswer {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

const problem = (status: number, code: string): WorklistAnswer => ({
  status,
  body: { type: `urn:hms:error:${code}`, title: code, status, code },
});

const patient = (n: number, nameEn: string) => ({
  patientId: ID(100 + n),
  mrn: `HMS-2026-00000${n}`,
  nameEn,
  nameBn: null,
});

function checkedIn(n: number, nameEn: string, status: WorklistEntry['status']): WorklistEntry {
  return {
    appointmentId: ID(n),
    patient: patient(n, nameEn),
    status,
    visitId: ID(200 + n),
    visitVersion: 1,
    queueNumber: n,
    arrivedAt: new Date(Date.now() - (20 - n) * 60_000).toISOString(),
    consultationId: null,
  };
}

export function createWorklistStore() {
  const entries: WorklistEntry[] = [
    checkedIn(1, 'Salma Begum', 'WAITING'),
    checkedIn(2, 'Rahim Uddin', 'WAITING_PAYMENT'),
    {
      appointmentId: ID(3),
      patient: patient(3, 'Karim Ahmed'),
      status: 'EXPECTED',
      visitId: null,
      visitVersion: null,
      queueNumber: null,
      arrivedAt: null,
      consultationId: null,
    },
  ];
  const consultations = new Map<string, Consultation>();
  const state = { linked: true, revision: 1 };

  const worklist = () =>
    doctorWorklistSchema.parse({
      date: new Date().toISOString().slice(0, 10),
      practitioner: state.linked
        ? {
            practitionerId: ID(500),
            nameBn: null,
            nameEn: 'Nasrin Akter',
            specialty: 'Medicine',
            department: null,
          }
        : null,
      sessions: state.linked
        ? [
            {
              sessionId: ID(900),
              startsAt: new Date().toISOString(),
              endsAt: new Date(Date.now() + 4 * 3600_000).toISOString(),
              startTime: '17:00',
              endTime: '21:00',
              entries,
            },
          ]
        : [],
    });

  /** The cashier takes the doctor fee: WAITING_PAYMENT becomes WAITING. */
  function pay(appointmentId: string): void {
    const entry = entries.find((row) => row.appointmentId === appointmentId);
    if (entry?.status === 'WAITING_PAYMENT') {
      entry.status = 'WAITING';
      state.revision += 1;
    }
  }

  function unlink(): void {
    state.linked = false;
    state.revision += 1;
  }

  function start(visitId: string, body: unknown): WorklistAnswer {
    const request = startConsultationRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    const entry = entries.find((row) => row.visitId === visitId);
    if (!entry) return problem(404, 'NOT_FOUND');
    if (entry.status === 'WAITING_PAYMENT') return problem(409, 'PAYMENT_NOT_ELIGIBLE');
    if (entry.visitVersion !== request.data.expectedVersion) return problem(409, 'STALE_RECORD');
    if (entry.status !== 'WAITING') return problem(409, 'INVALID_TRANSITION');
    const consultation = consultationSchema.parse({
      consultationId: ID(300 + (entry.queueNumber ?? 0)),
      visitId,
      patient: entry.patient,
      status: 'IN_CONSULTATION',
      startedAt: new Date().toISOString(),
      version: 1,
    });
    consultations.set(consultation.consultationId, consultation);
    entry.status = 'IN_CONSULTATION';
    entry.visitVersion = 2;
    entry.consultationId = consultation.consultationId;
    state.revision += 1;
    return { status: 201, body: consultation };
  }

  function answer(
    method: string,
    path: string,
    body: unknown,
    ifNoneMatch: string | null,
  ): WorklistAnswer | null {
    if (path === '/worklist' && method === 'GET') {
      const etag = `"worklist-${state.revision}"`;
      if (ifNoneMatch === etag) return { status: 304, headers: { ETag: etag } };
      return { status: 200, body: worklist(), headers: { ETag: etag } };
    }
    const startPath = /^\/visits\/([^/]+)\/consultation\/start$/.exec(path);
    if (startPath?.[1] && method === 'POST') return start(startPath[1], body);
    const readPath = /^\/consultations\/([^/]+)$/.exec(path);
    if (readPath?.[1] && method === 'GET') {
      const found = consultations.get(readPath[1]);
      return found ? { status: 200, body: found } : problem(404, 'NOT_FOUND');
    }
    return null;
  }

  return { entries, answer, pay, unlink };
}
