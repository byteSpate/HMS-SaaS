// In-memory stand-in for the appointment and check-in endpoints (T-SCH-02, T-VIS-01), answering
// with payloads that satisfy the shared contracts. It shares the session list of
// mock-schedule-sessions.ts and the patients of mock-patients.ts, and keeps their booked counts.
// The real behaviour (RLS, races, audit, version checks, the visit and its invoice) is covered by
// apps/api/src/appointments.api.spec.ts and check-in.api.spec.ts. Names are synthetic.
import {
  appointmentListSchema,
  appointmentSchema,
  bookAppointmentRequestSchema,
  checkInRequestSchema,
  cancelAppointmentRequestSchema,
  markNoShowRequestSchema,
  rescheduleAppointmentRequestSchema,
  scheduleSessionListSchema,
  visitCheckInSchema,
  type Appointment,
  type PatientDetail,
  type ScheduleSession,
} from '@hms/contracts';

const ID = (n: number): string => `0199e0b0-0000-7000-8000-${String(n).padStart(12, '0')}`;

export interface AppointmentAnswer {
  status: number;
  body?: unknown;
}

const problem = (status: number, code: string, fields?: { path: string; message: string }[]) => ({
  status,
  body: { type: `urn:hms:error:${code}`, title: code, status, code, ...(fields ? { fields } : {}) },
});

export function createAppointmentStore(sessions: ScheduleSession[], patients: PatientDetail[]) {
  let next = 901;
  const appointments: Appointment[] = [];
  /** Set by a test to act as another receptionist who took the last place first (AT-SCH-003). */
  const state = {
    lastPlaceTakenElsewhere: false,
    /** The doctor's new-patient fee at check-in; null for none configured (UC-VIS-01 A1). */
    doctorFee: '500.00' as string | null,
  };
  const lastQueueNumber = new Map<string, number>();
  let invoices = 0;

  const sessionIndex = (sessionId: string) =>
    sessions.findIndex((row) => row.sessionId === sessionId);
  const ended = (session: { endsAt: string }) => new Date(session.endsAt).getTime() <= Date.now();

  function shift(sessionId: string, by: number) {
    const index = sessionIndex(sessionId);
    const session = sessions[index];
    if (session) sessions[index] = { ...session, bookedCount: session.bookedCount + by };
  }

  /** A new BOOKED appointment, or the refusal the API would give. */
  function place(patientId: string, sessionId: string, rescheduledFromId: string | null) {
    const patient = patients.find((row) => row.patientId === patientId);
    const session = sessions[sessionIndex(sessionId)];
    if (!patient) return problem(422, 'VALIDATION_FAILED', [{ path: 'patientId', message: 'x' }]);
    if (!session || session.status !== 'PUBLISHED' || ended(session)) {
      return problem(422, 'VALIDATION_FAILED', [{ path: 'sessionId', message: 'not open' }]);
    }
    if (state.lastPlaceTakenElsewhere || session.bookedCount >= session.capacity) {
      return problem(409, 'CAPACITY_FULL');
    }
    const created = appointmentSchema.parse({
      appointmentId: ID(next++),
      patient: {
        patientId: patient.patientId,
        mrn: patient.mrn,
        nameBn: patient.nameBn,
        nameEn: patient.nameEn,
      },
      session: {
        sessionId: session.sessionId,
        practitioner: session.practitioner,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
      },
      status: 'BOOKED',
      rescheduledFromId,
      cancelReason: null,
      bookedAt: new Date().toISOString(),
      version: 1,
    });
    appointments.push(created);
    shift(sessionId, 1);
    return { status: 201, body: created };
  }

  /** The request's fields for the action, or null when the body does not fit its contract. */
  function parsed(action: string, body: unknown) {
    if (action === 'cancel') return cancelAppointmentRequestSchema.safeParse(body).data ?? null;
    if (action === 'no-show') return markNoShowRequestSchema.safeParse(body).data ?? null;
    return rescheduleAppointmentRequestSchema.safeParse(body).data ?? null;
  }

  function change(appointmentId: string, action: string, body: unknown): AppointmentAnswer {
    const index = appointments.findIndex((row) => row.appointmentId === appointmentId);
    const stored = appointments[index];
    if (!stored) return problem(404, 'NOT_FOUND');
    const request = parsed(action, body);
    if (!request) return problem(422, 'VALIDATION_FAILED');
    if (request.expectedVersion !== stored.version) return problem(409, 'STALE_RECORD');
    if (stored.status !== 'BOOKED') return problem(409, 'INVALID_TRANSITION');
    if ((action === 'no-show') !== ended(stored.session)) return problem(409, 'INVALID_TRANSITION');

    if (action === 'reschedule') {
      // Validated above with the same schema.
      const { sessionId } = rescheduleAppointmentRequestSchema.parse(body);
      const moved = place(stored.patient.patientId, sessionId, stored.appointmentId);
      if (moved.status !== 201) return moved;
      appointments[index] = { ...stored, status: 'RESCHEDULED', version: stored.version + 1 };
      shift(stored.session.sessionId, -1);
      return moved;
    }
    const reason = 'reason' in request ? request.reason : null;
    const updated = appointmentSchema.parse({
      ...stored,
      status: action === 'cancel' ? 'CANCELLED' : 'NO_SHOW',
      cancelReason: reason,
      version: stored.version + 1,
    });
    appointments[index] = updated;
    if (action === 'cancel') shift(stored.session.sessionId, -1);
    return { status: 200, body: updated };
  }

  /** T-VIS-01: the appointment CHECKED_IN, the next serial number, the doctor fee if set. */
  function checkIn(body: unknown): AppointmentAnswer {
    const request = checkInRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    const index = appointments.findIndex((row) => row.appointmentId === request.data.appointmentId);
    const stored = appointments[index];
    if (!stored) return problem(404, 'NOT_FOUND');
    if (stored.version !== request.data.expectedVersion) return problem(409, 'STALE_RECORD');
    if (stored.status !== 'BOOKED') return problem(409, 'INVALID_TRANSITION');
    appointments[index] = { ...stored, status: 'CHECKED_IN', version: stored.version + 1 };
    const queueNumber = (lastQueueNumber.get(stored.session.sessionId) ?? 0) + 1;
    lastQueueNumber.set(stored.session.sessionId, queueNumber);
    const fee = state.doctorFee;
    const doctorFee = fee
      ? {
          status: 'ISSUED',
          followUp: false,
          invoice: {
            invoiceId: ID(980 + invoices),
            number: `INV-${String(++invoices).padStart(6, '0')}`,
            type: 'DOCTOR_FEE',
            status: 'ISSUED',
            total: fee,
            paid: '0.00',
            balance: fee,
          },
        }
      : { status: 'POLICY_NOT_CONFIGURED' };
    return {
      status: 201,
      body: visitCheckInSchema.parse({
        visitId: ID(950 + queueNumber),
        appointmentId: stored.appointmentId,
        patientId: stored.patient.patientId,
        kind: 'OPD_CONSULTATION',
        status: 'OPEN',
        practitioner: stored.session.practitioner,
        queueNumber,
        arrivedAt: new Date().toISOString(),
        doctorFee,
      }),
    };
  }

  function answer(
    method: string,
    path: string,
    body: unknown,
    query: URLSearchParams,
  ): AppointmentAnswer | null {
    if (path === '/appointments' && method === 'GET') {
      const sessionId = query.get('sessionId');
      const patientId = query.get('patientId');
      const rows = appointments
        .filter((row) =>
          sessionId ? row.session.sessionId === sessionId : row.patient.patientId === patientId,
        )
        .sort((a, b) => a.session.startsAt.localeCompare(b.session.startsAt));
      return { status: 200, body: appointmentListSchema.parse({ appointments: rows }) };
    }
    if (path === '/appointments/bookable-sessions' && method === 'GET') {
      const from = query.get('from') ?? '';
      const to = query.get('to') ?? '';
      const open = sessions
        .filter((row) => row.sessionDate >= from && row.sessionDate <= to)
        .filter((row) => row.status === 'PUBLISHED' && !ended(row))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      return { status: 200, body: scheduleSessionListSchema.parse({ sessions: open }) };
    }
    if (path === '/appointments' && method === 'POST') {
      const request = bookAppointmentRequestSchema.safeParse(body);
      if (!request.success) return problem(422, 'VALIDATION_FAILED');
      return place(request.data.patientId, request.data.sessionId, null);
    }
    if (path === '/visits/check-in' && method === 'POST') return checkIn(body);
    const match = /^\/appointments\/([0-9a-f-]+)\/(cancel|no-show|reschedule)$/.exec(path);
    if (match?.[1] && match[2] && method === 'POST') return change(match[1], match[2], body);
    return null;
  }

  return { answer, appointments, state };
}
