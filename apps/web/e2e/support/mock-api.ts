// A small in-memory stand-in for the auth API, answering with payloads that satisfy the shared
// contracts. It lets the browser tests exercise the real screens (cookie-less, cross-origin, CSRF
// header and all) without a database. Behavior against the real API is covered by apps/api tests
// and by the manual smoke run recorded in the T-UI-02 log.
import { auditEventSchema, sessionResponseSchema, type SessionResponse } from '@hms/contracts';
import type { Page, Route } from '@playwright/test';
import { createAdminStore } from './mock-admin';
import { createAppointmentStore } from './mock-appointments';
import { createPatientStore } from './mock-patients';
import { createDepartmentStore } from './mock-departments';
import { createPractitionerStore } from './mock-practitioners';
import { createBillingStore } from './mock-billing';
import { createPaymentStore } from './mock-payments';
import { createPriceListStore } from './mock-price-lists';
import { createScheduleSessionStore } from './mock-schedule-sessions';

const WEB_ORIGIN = 'http://localhost:3100';

export interface MockMembership {
  id: string;
  tenantId: string;
  tenantNameEn: string | null;
  tenantNameBn: string | null;
}

export interface MockWorld {
  password: string;
  displayName: string;
  username: string;
  preferredLang: 'bn-BD' | 'en';
  memberships: MockMembership[];
  /** Seconds the idle timeout has left when a session is issued or read. */
  idleSeconds: number;
  online: boolean;
  /** T-ACC-04: the chosen hospital's roles need a second factor. */
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  /** T-ACC-05: permission codes of the chosen hospital's roles, and a forced password change. */
  permissions: string[];
  mustChangePassword: boolean;
}

export interface RecordedRequest {
  method: string;
  path: string;
  query: string;
  csrf: string | null;
  /** T-PLT-01: commands carry one; null on reads. */
  idempotencyKey: string | null;
  body: unknown;
}

const ID = (n: number): string => `0199e0a0-0000-7000-8000-${String(n).padStart(12, '0')}`;

export const HOSPITAL_ONE: MockMembership = {
  id: ID(11),
  tenantId: ID(21),
  tenantNameEn: 'Sondhani Medical',
  tenantNameBn: 'Sondhani Medical BN',
};

export const MOCK_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
export const MOCK_TOTP_CODE = '123456';
export const MOCK_RECOVERY_CODES = Array.from({ length: 10 }, (_, index) =>
  `abcd${index}-efgh${index}`.replace(/[01]/g, 'z'),
);

export function newWorld(overrides: Partial<MockWorld> = {}): MockWorld {
  return {
    username: 'rahim',
    password: 'correct horse battery',
    displayName: 'Rahim Uddin',
    preferredLang: 'bn-BD',
    memberships: [HOSPITAL_ONE],
    idleSeconds: 3600,
    online: true,
    mfaRequired: false,
    mfaEnrolled: false,
    permissions: [],
    mustChangePassword: false,
    ...overrides,
  };
}

const PROBLEM = (status: number, code: string) => ({
  type: 'about:blank',
  title: code,
  status,
  code,
});

/** Two pages of audit events (T-PLT-02); a person filter finds nothing. */
function auditPage(query: URLSearchParams) {
  const row = (id: number, action: string, outcome: 'SUCCEEDED' | 'DENIED') =>
    auditEventSchema.parse({
      id: ID(id),
      occurredAt: '2026-11-02T04:00:00.000Z',
      action,
      outcome,
      actorUserId: ID(1),
      actorName: 'Mock User',
      targetType: null,
      targetId: null,
      reason: null,
      correlationId: null,
      details: null,
    });
  if (query.get('actor')) return { rows: [], nextCursor: null };
  return query.get('cursor')
    ? { rows: [row(902, 'authz.access.denied', 'DENIED')], nextCursor: null }
    : { rows: [row(901, 'admin.user.created', 'SUCCEEDED')], nextCursor: ID(901) };
}

export async function installMockApi(page: Page, world: MockWorld) {
  const requests: RecordedRequest[] = [];
  let activeMembershipId: string | null = null;
  let signedIn = false;
  let csrf = 'csrf-token-1';
  let issued = 0;
  let mfaVerified = false;
  const admin = createAdminStore();
  const patients = createPatientStore();
  const practitioners = createPractitionerStore();
  const departments = createDepartmentStore();
  const priceLists = createPriceListStore();
  const billing = createBillingStore();
  const cashierDesk = createPaymentStore(billing.openSession);
  const scheduleSessions = createScheduleSessionStore();
  const appointments = createAppointmentStore(scheduleSessions.sessions, patients.patients);

  function session(): SessionResponse {
    const now = Date.now();
    return sessionResponseSchema.parse({
      user: { id: ID(1), displayName: world.displayName, preferredLang: world.preferredLang },
      memberships: world.memberships,
      activeMembershipId,
      csrfToken: csrf,
      idleExpiresAt: new Date(now + world.idleSeconds * 1000).toISOString(),
      absoluteExpiresAt: new Date(now + 12 * 3600 * 1000).toISOString(),
      mfa: { required: world.mfaRequired, enrolled: world.mfaEnrolled, verified: mfaVerified },
      passwordChangeRequired: world.mustChangePassword,
      permissions: activeMembershipId ? world.permissions : [],
    });
  }

  function reply(route: Route, status: number, body?: unknown, meta: object = {}) {
    return route.fulfill({
      status,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': WEB_ORIGIN,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Accept',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, OPTIONS',
      },
      // Success bodies are enveloped like the real API (T-PLT-08); problem details are not.
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(
              status < 400
                ? { data: body, meta: { correlationId: 'mock-request', ...meta } }
                : body,
            ),
          }),
    });
  }

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (request.method() === 'OPTIONS') return reply(route, 204);
    if (!world.online) return route.abort('connectionrefused');

    const body = request.postData() ? JSON.parse(request.postData() as string) : undefined;
    requests.push({
      method: request.method(),
      path,
      query: new URL(request.url()).search,
      csrf: request.headers()['x-csrf-token'] ?? null,
      idempotencyKey: request.headers()['idempotency-key'] ?? null,
      body,
    });

    if (path === '/audit/events') {
      const page = auditPage(new URL(request.url()).searchParams);
      return reply(route, 200, page.rows, { nextCursor: page.nextCursor });
    }
    if (path === '/auth/login') return answerLogin(route, body);
    if (path === '/auth/password-reset-requests') return reply(route, 202);
    if (!signedIn) return reply(route, 401, PROBLEM(401, 'UNAUTHENTICATED'));

    if (path === '/auth/session' && request.method() === 'GET') return reply(route, 200, session());
    if (path === '/auth/preferences') {
      world.preferredLang = body.preferredLang;
      return reply(route, 200, session());
    }
    if (path === '/auth/logout') {
      signedIn = false;
      activeMembershipId = null;
      mfaVerified = false;
      return reply(route, 204);
    }
    if (path.startsWith('/auth/mfa/')) return answerMfa(route, path, body);
    if (path === '/auth/password') return answerPasswordChange(route, body);
    const moduleAnswer =
      admin.answer(request.method(), path, body as never) ??
      patients.answer(request.method(), path, body as never) ??
      practitioners.answer(request.method(), path, body) ??
      departments.answer(request.method(), path, body) ??
      priceLists.answer(request.method(), path, body) ??
      billing.answer(request.method(), path, body, new URL(request.url()).searchParams) ??
      cashierDesk.answer(request.method(), path, body, new URL(request.url()).searchParams) ??
      scheduleSessions.answer(request.method(), path, body, new URL(request.url()).searchParams) ??
      appointments.answer(request.method(), path, body, new URL(request.url()).searchParams);
    if (moduleAnswer) return reply(route, moduleAnswer.status, moduleAnswer.body);
    return reply(route, 404, PROBLEM(404, 'NOT_FOUND'));
  });

  function answerLogin(route: Route, body: { username?: string; password?: string }) {
    if (body.username !== world.username || body.password !== world.password) {
      return reply(route, 401, PROBLEM(401, 'INVALID_CREDENTIALS'));
    }
    signedIn = true;
    issued += 1;
    csrf = `csrf-token-${issued}`;
    activeMembershipId = world.memberships.length === 1 ? (world.memberships[0]?.id ?? null) : null;
    return reply(route, 200, session());
  }

  // T-ACC-04: the authenticator app "shows" MOCK_TOTP_CODE; recovery codes are MOCK_RECOVERY_CODES.
  function answerMfa(route: Route, path: string, body: { code?: string; recoveryCode?: string }) {
    if (path === '/auth/mfa/enrolment') {
      return reply(route, 200, {
        secret: MOCK_TOTP_SECRET,
        otpauthUri: `otpauth://totp/HMS:${world.username}?secret=${MOCK_TOTP_SECRET}&issuer=HMS`,
      });
    }
    const verifying = path === '/auth/mfa/verify';
    const accepted =
      body.code === MOCK_TOTP_CODE ||
      (verifying && MOCK_RECOVERY_CODES.includes(body.recoveryCode ?? ''));
    if (!accepted) return reply(route, 401, PROBLEM(401, 'MFA_CODE_INVALID'));
    world.mfaEnrolled = true;
    mfaVerified = true;
    issued += 1;
    csrf = `csrf-token-${issued}`;
    return verifying
      ? reply(route, 200, session())
      : reply(route, 200, { session: session(), recoveryCodes: MOCK_RECOVERY_CODES });
  }

  // T-ACC-05: own password change; a wrong current password is a field error (422).
  function answerPasswordChange(
    route: Route,
    body: { currentPassword?: string; newPassword?: string },
  ) {
    if (body.currentPassword !== world.password) {
      return reply(route, 422, PROBLEM(422, 'VALIDATION_FAILED'));
    }
    world.password = body.newPassword ?? '';
    world.mustChangePassword = false;
    issued += 1;
    csrf = `csrf-token-${issued}`;
    return reply(route, 200, session());
  }

  return {
    requests,
    admin,
    patients,
    practitioners,
    departments,
    priceLists,
    billing,
    cashierDesk,
    scheduleSessions,
    appointments,
  };
}
