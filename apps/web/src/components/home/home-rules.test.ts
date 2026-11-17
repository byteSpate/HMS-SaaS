import type { DoctorWorklist, ScheduleSession, WorklistEntry } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import {
  homeViews,
  longestWaitMinutes,
  receptionCounts,
  sessionPhase,
  setupProgress,
  worklistCounts,
} from './home-rules';

const NOW = new Date('2026-11-17T08:30:00.000Z');

function session(overrides: Partial<ScheduleSession>): ScheduleSession {
  return {
    startsAt: '2026-11-17T08:00:00.000Z',
    endsAt: '2026-11-17T11:00:00.000Z',
    status: 'PUBLISHED',
    bookedCount: 0,
    ...overrides,
  } as ScheduleSession;
}

function entry(status: WorklistEntry['status'], arrivedAt: string | null = null): WorklistEntry {
  return { status, arrivedAt } as WorklistEntry;
}

describe('homeViews', () => {
  it('gives one view per permission group, in a fixed order', () => {
    const granted = new Set([
      'audit.view',
      'clinical.consultation.record',
      'patient.record.search',
    ]);
    expect(homeViews(granted)).toEqual(['reception', 'doctor', 'admin']);
  });

  it('gives no view to a user without any of the permissions', () => {
    expect(homeViews(new Set(['some.other.code']))).toEqual([]);
  });
});

describe('sessionPhase', () => {
  it('tells running, upcoming and finished apart for a published session', () => {
    expect(sessionPhase(session({}), NOW)).toBe('running');
    expect(sessionPhase(session({ startsAt: '2026-11-17T09:00:00.000Z' }), NOW)).toBe('upcoming');
    expect(sessionPhase(session({ endsAt: '2026-11-17T08:30:00.000Z' }), NOW)).toBe('finished');
  });

  it('never calls a draft or cancelled session running', () => {
    expect(sessionPhase(session({ status: 'DRAFT' }), NOW)).toBe('draft');
    expect(sessionPhase(session({ status: 'CANCELLED' }), NOW)).toBe('cancelled');
  });
});

describe('receptionCounts', () => {
  it('counts only published sessions and adds up their bookings', () => {
    const counts = receptionCounts(
      [
        session({ bookedCount: 4 }),
        session({
          bookedCount: 2,
          startsAt: '2026-11-17T12:00:00.000Z',
          endsAt: '2026-11-17T14:00:00.000Z',
        }),
        session({ bookedCount: 9, status: 'CANCELLED' }),
        session({ status: 'DRAFT' }),
      ],
      NOW,
    );
    expect(counts).toEqual({ sessions: 2, running: 1, booked: 6 });
  });
});

describe('doctor counts', () => {
  const worklist = {
    sessions: [
      {
        entries: [
          entry('WAITING', '2026-11-17T08:00:00.000Z'),
          entry('WAITING', '2026-11-17T08:20:00.000Z'),
          entry('CONSULTED', '2026-11-17T07:00:00.000Z'),
          entry('EXPECTED'),
        ],
      },
    ],
  } as DoctorWorklist;

  it('counts the patients per status', () => {
    expect(worklistCounts(worklist)).toMatchObject({ WAITING: 2, CONSULTED: 1, EXPECTED: 1 });
  });

  it('gives the longest wait among those still waiting, or null', () => {
    expect(longestWaitMinutes(worklist, NOW)).toBe(30);
    expect(longestWaitMinutes({ sessions: [] } as unknown as DoctorWorklist, NOW)).toBeNull();
  });
});

describe('setupProgress', () => {
  it('counts the finished steps', () => {
    expect(
      setupProgress([
        { id: 'departments', done: true },
        { id: 'fees', done: false },
      ]),
    ).toEqual({ done: 1, total: 2 });
  });
});
