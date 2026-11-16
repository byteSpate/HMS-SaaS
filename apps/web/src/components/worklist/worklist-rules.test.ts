import type { DoctorWorklist, WorklistEntry } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import { canStart, newlyWaiting, nextWaiting, waitingMinutes } from './worklist-rules';

// The doctor worklist screen's rules (T-CLI-01; FR-CLI-002; F section 4.3; F section 7.3).
// Names are synthetic (AS-009).
const ID = (n: number) => `0199e0b0-0000-7000-8000-${String(n).padStart(12, '0')}`;

const entry = (n: number, status: WorklistEntry['status']): WorklistEntry => ({
  appointmentId: ID(n),
  patient: { patientId: ID(100 + n), mrn: `MRN-${n}`, nameEn: `Patient ${n}`, nameBn: null },
  status,
  visitId: status === 'EXPECTED' ? null : ID(200 + n),
  visitVersion: status === 'EXPECTED' ? null : 1,
  queueNumber: status === 'EXPECTED' ? null : n,
  arrivedAt: status === 'EXPECTED' ? null : '2026-11-16T11:00:00.000Z',
  consultationId: null,
});

const worklistOf = (...entries: WorklistEntry[]): DoctorWorklist => ({
  date: '2026-11-16',
  practitioner: null,
  sessions: [
    {
      sessionId: ID(900),
      startsAt: '2026-11-16T11:00:00.000Z',
      endsAt: '2026-11-16T15:00:00.000Z',
      startTime: '17:00',
      endTime: '21:00',
      entries,
    },
  ],
});

describe('worklist rules', () => {
  it('F 4.3: only a WAITING patient can be opened; waiting for payment cannot', () => {
    expect(canStart(entry(1, 'WAITING'))).toBe(true);
    expect(canStart(entry(2, 'WAITING_PAYMENT'))).toBe(false);
    expect(canStart(entry(3, 'EXPECTED'))).toBe(false);
    expect(canStart(entry(4, 'IN_CONSULTATION'))).toBe(false);
  });

  it('the next patient is the first WAITING one in queue order', () => {
    const list = worklistOf(
      entry(1, 'CONSULTED'),
      entry(2, 'WAITING_PAYMENT'),
      entry(3, 'WAITING'),
    );
    expect(nextWaiting(list)?.appointmentId).toBe(ID(3));
    expect(nextWaiting(worklistOf(entry(1, 'EXPECTED')))).toBeNull();
  });

  it('counts whole minutes since arrival, never below zero', () => {
    const now = new Date('2026-11-16T11:12:40.000Z');
    expect(waitingMinutes(entry(1, 'WAITING'), now)).toBe(12);
    expect(waitingMinutes(entry(2, 'EXPECTED'), now)).toBeNull();
    expect(waitingMinutes(entry(3, 'WAITING'), new Date('2026-11-16T10:00:00.000Z'))).toBe(0);
  });

  it('F 7.3: counts the patients who became WAITING since the last list', () => {
    const before = worklistOf(entry(1, 'WAITING'), entry(2, 'WAITING_PAYMENT'));
    const after = worklistOf(entry(1, 'WAITING'), entry(2, 'WAITING'), entry(3, 'WAITING'));
    expect(newlyWaiting(before, after)).toBe(2);
    expect(newlyWaiting(undefined, after)).toBe(0);
  });
});
