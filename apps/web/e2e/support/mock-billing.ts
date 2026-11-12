// In-memory stand-in for the cashier endpoints (T-BIL-03 cashier sessions), answering with payloads
// that satisfy the shared contracts. Used by the cashier browser tests; the real behaviour (locks,
// segregation of duty, audit) is covered by apps/api/src/cashier-sessions.api.spec.ts. Names are
// synthetic.
import {
  cashierSessionSchema,
  closeCashierSessionRequestSchema,
  openCashierSessionRequestSchema,
  PAYMENT_METHODS,
  reviewCashierSessionRequestSchema,
  type CashierSession,
} from '@hms/contracts';

const ID = (n: number): string => `0199e0c0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const CASHIER = { userId: ID(1), displayName: 'Nasima Khatun' };
const COLLEAGUE = { userId: ID(2), displayName: 'Rafiq Hasan' };

export interface BillingAnswer {
  status: number;
  body?: unknown;
}

const problem = (status: number, code: string, fields?: { path: string; message: string }[]) => ({
  status,
  body: { type: `urn:hms:error:${code}`, title: code, status, code, ...(fields ? { fields } : {}) },
});

/** "1500.25" to 150025 and back with integers, so the mock never adds floats either (ADR-007). */
export function centsOf(text: string): number {
  const [major = '0', minor = '00'] = text.replace('-', '').split('.');
  const value = Number(major) * 100 + Number(minor.padEnd(2, '0'));
  return text.startsWith('-') ? -value : value;
}
export function amountOfCents(value: number): string {
  const units = Math.abs(value);
  return `${value < 0 ? '-' : ''}${Math.floor(units / 100)}.${String(units % 100).padStart(2, '0')}`;
}

export function createBillingStore() {
  let next = 900;
  const sessions: CashierSession[] = [];

  const view = (session: CashierSession) => cashierSessionSchema.parse(session);
  const findSession = (sessionId: string) =>
    sessions.find((session) => session.sessionId === sessionId);
  const openSession = () => sessions.find((session) => session.status === 'OPEN');

  /** A colleague's session closed earlier, waiting for finance (for the review tests). */
  function seedClosedSession(countedCash: string, openingFloat = '1000.00') {
    const variance = centsOf(countedCash) - centsOf(openingFloat);
    const session: CashierSession = {
      sessionId: ID(next++),
      cashier: COLLEAGUE,
      status: 'CLOSED_PENDING_REVIEW',
      openingFloat,
      openedAt: new Date(Date.now() - 8 * 3_600_000).toISOString(),
      closedAt: new Date(Date.now() - 3_600_000).toISOString(),
      totals: PAYMENT_METHODS.map((method) =>
        method === 'CASH'
          ? {
              method,
              expected: openingFloat,
              counted: countedCash,
              variance: amountOfCents(variance),
            }
          : { method, expected: '0.00', counted: '0.00', variance: '0.00' },
      ),
      hasVariance: variance !== 0,
      review: null,
      version: 2,
    };
    sessions.push(session);
    return session;
  }

  function open(body: unknown): BillingAnswer {
    const request = openCashierSessionRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    if (openSession()) return problem(409, 'INVALID_TRANSITION');
    const openingFloat = request.data.openingFloat ?? '0.00';
    const session: CashierSession = {
      sessionId: ID(next++),
      cashier: CASHIER,
      status: 'OPEN',
      openingFloat,
      openedAt: new Date().toISOString(),
      closedAt: null,
      totals: PAYMENT_METHODS.map((method) => ({
        method,
        expected: method === 'CASH' ? openingFloat : '0.00',
        counted: null,
        variance: null,
      })),
      hasVariance: false,
      review: null,
      version: 1,
    };
    sessions.push(session);
    return { status: 201, body: view(session) };
  }

  function close(sessionId: string, body: unknown): BillingAnswer {
    const session = findSession(sessionId);
    const request = closeCashierSessionRequestSchema.safeParse(body);
    if (!session) return problem(404, 'NOT_FOUND');
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    if (session.status !== 'OPEN') return problem(409, 'INVALID_TRANSITION');
    if (request.data.expectedVersion !== session.version) return problem(409, 'STALE_RECORD');
    session.totals = session.totals.map((row) => {
      const counted = request.data.counted[row.method];
      return { ...row, counted, variance: amountOfCents(centsOf(counted) - centsOf(row.expected)) };
    });
    session.hasVariance = session.totals.some((row) => row.variance !== '0.00');
    session.status = 'CLOSED_PENDING_REVIEW';
    session.closedAt = new Date().toISOString();
    session.version += 1;
    return { status: 200, body: view(session) };
  }

  function review(sessionId: string, body: unknown): BillingAnswer {
    const session = findSession(sessionId);
    const request = reviewCashierSessionRequestSchema.safeParse(body);
    if (!session) return problem(404, 'NOT_FOUND');
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    if (session.status !== 'CLOSED_PENDING_REVIEW') return problem(409, 'INVALID_TRANSITION');
    if (session.hasVariance && !request.data.note) {
      return problem(422, 'VALIDATION_FAILED', [{ path: 'note', message: 'Required' }]);
    }
    session.status = 'REVIEWED';
    session.review = {
      reviewedBy: CASHIER,
      reviewedAt: new Date().toISOString(),
      note: request.data.note ?? null,
    };
    session.version += 1;
    return { status: 200, body: view(session) };
  }

  function answer(
    method: string,
    path: string,
    body: unknown,
    query: URLSearchParams,
  ): BillingAnswer | undefined {
    if (path === '/billing/cashier-sessions/current' && method === 'GET') {
      const session = openSession();
      return { status: 200, body: { session: session ? view(session) : null } };
    }
    if (path === '/billing/cashier-sessions') {
      if (method === 'POST') return open(body);
      if (method === 'GET') {
        const status = query.get('status') ?? 'CLOSED_PENDING_REVIEW';
        return {
          status: 200,
          body: { sessions: sessions.filter((row) => row.status === status).map(view) },
        };
      }
    }
    const command = /^\/billing\/cashier-sessions\/([^/]+)\/(close|review)$/.exec(path);
    if (command?.[1] && method === 'POST') {
      return command[2] === 'close' ? close(command[1], body) : review(command[1], body);
    }
    return undefined;
  }

  return { sessions, seedClosedSession, answer };
}
