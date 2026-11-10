// In-memory stand-in for the schedule session endpoints (T-SCH-01), answering with payloads that
// satisfy the shared contracts. Used by the schedule browser tests; the real behaviour (RLS, ended
// sessions, audit, version checks) is covered by apps/api/src/schedule-sessions.api.spec.ts.
// Times are taken as Dhaka time (UTC+6, no daylight saving). Names are synthetic.
import {
  changeScheduleSessionRequestSchema,
  createScheduleSessionRequestSchema,
  practitionerChoiceListSchema,
  scheduleSessionListSchema,
  scheduleSessionSchema,
  type PractitionerChoice,
  type ScheduleSession,
} from '@hms/contracts';

const ID = (n: number): string => `0199e0b0-0000-7000-8000-${String(n).padStart(12, '0')}`;

export interface ScheduleSessionAnswer {
  status: number;
  body?: unknown;
}

const problem = (status: number, code: string, fields?: { path: string; message: string }[]) => ({
  status,
  body: { type: `urn:hms:error:${code}`, title: code, status, code, ...(fields ? { fields } : {}) },
});

const instant = (date: string, time: string) => new Date(`${date}T${time}:00+06:00`).toISOString();

export function createScheduleSessionStore() {
  let next = 802;
  const practitioners: PractitionerChoice[] = [
    {
      practitionerId: ID(801),
      nameBn: null,
      nameEn: 'Karim Uddin',
      specialty: 'Medicine',
      department: null,
    },
  ];
  const sessions: ScheduleSession[] = [];

  function create(body: unknown): ScheduleSessionAnswer {
    const request = createScheduleSessionRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    const { practitionerId, sessionDate, startTime, endTime, capacity } = request.data;
    const practitioner = practitioners.find((row) => row.practitionerId === practitionerId);
    if (!practitioner) {
      return problem(422, 'VALIDATION_FAILED', [{ path: 'practitionerId', message: 'inactive' }]);
    }
    const startsAt = instant(sessionDate, startTime);
    const endsAt = instant(sessionDate, endTime);
    const overlaps = sessions.some(
      (row) =>
        row.practitioner.practitionerId === practitionerId &&
        row.status !== 'CANCELLED' &&
        row.startsAt < endsAt &&
        row.endsAt > startsAt,
    );
    if (overlaps) {
      return problem(422, 'VALIDATION_FAILED', [{ path: 'startTime', message: 'overlap' }]);
    }
    const created = scheduleSessionSchema.parse({
      sessionId: ID(next++),
      practitioner,
      sessionDate,
      startTime,
      endTime,
      startsAt,
      endsAt,
      capacity,
      bookedCount: 0,
      status: 'DRAFT',
      version: 1,
    });
    sessions.push(created);
    return { status: 201, body: created };
  }

  function change(sessionId: string, action: string, body: unknown): ScheduleSessionAnswer {
    const index = sessions.findIndex((row) => row.sessionId === sessionId);
    const stored = sessions[index];
    if (!stored) return problem(404, 'NOT_FOUND');
    const request = changeScheduleSessionRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    if (request.data.expectedVersion !== stored.version) return problem(409, 'STALE_RECORD');
    const allowed =
      (action === 'publish' && stored.status === 'DRAFT') ||
      (action === 'cancel' && stored.status !== 'CANCELLED' && stored.bookedCount === 0);
    if (!allowed) return problem(409, 'INVALID_TRANSITION');
    const updated = scheduleSessionSchema.parse({
      ...stored,
      status: action === 'publish' ? 'PUBLISHED' : 'CANCELLED',
      version: stored.version + 1,
    });
    sessions[index] = updated;
    return { status: 200, body: updated };
  }

  function answer(
    method: string,
    path: string,
    body: unknown,
    query: URLSearchParams,
  ): ScheduleSessionAnswer | null {
    if (path === '/schedule-sessions/practitioner-choices' && method === 'GET') {
      return { status: 200, body: practitionerChoiceListSchema.parse({ practitioners }) };
    }
    if (path === '/schedule-sessions' && method === 'GET') {
      const from = query.get('from') ?? '';
      const to = query.get('to') ?? '';
      const inRange = sessions
        .filter((row) => row.sessionDate >= from && row.sessionDate <= to)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      return { status: 200, body: scheduleSessionListSchema.parse({ sessions: inRange }) };
    }
    if (path === '/schedule-sessions' && method === 'POST') return create(body);
    const match = /^\/schedule-sessions\/([0-9a-f-]+)\/(publish|cancel)$/.exec(path);
    if (match?.[1] && match[2] && method === 'POST') return change(match[1], match[2], body);
    return null;
  }

  return { answer, practitioners, sessions };
}
