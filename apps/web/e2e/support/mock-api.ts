// A small in-memory stand-in for the auth API, answering with payloads that satisfy the shared
// contracts. It lets the browser tests exercise the real screens (cookie-less, cross-origin, CSRF
// header and all) without a database. Behavior against the real API is covered by apps/api tests
// and by the manual smoke run recorded in the T-UI-02 log.
import { sessionResponseSchema, type SessionResponse } from '@hms/contracts';
import type { Page, Route } from '@playwright/test';

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
}

export interface RecordedRequest {
  method: string;
  path: string;
  csrf: string | null;
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

export const HOSPITAL_TWO: MockMembership = {
  id: ID(12),
  tenantId: ID(22),
  tenantNameEn: 'Green Crescent Clinic',
  tenantNameBn: null,
};

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
    ...overrides,
  };
}

const PROBLEM = (status: number, code: string) => ({
  type: 'about:blank',
  title: code,
  status,
  code,
});

export async function installMockApi(page: Page, world: MockWorld) {
  const requests: RecordedRequest[] = [];
  let activeMembershipId: string | null = null;
  let signedIn = false;
  let csrf = 'csrf-token-1';
  let issued = 0;
  let mfaVerified = false;

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
    });
  }

  function reply(route: Route, status: number, body?: unknown) {
    return route.fulfill({
      status,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': WEB_ORIGIN,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Accept',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
      csrf: request.headers()['x-csrf-token'] ?? null,
      body,
    });

    if (path === '/auth/login') {
      if (body?.username !== world.username || body?.password !== world.password) {
        return reply(route, 401, PROBLEM(401, 'INVALID_CREDENTIALS'));
      }
      signedIn = true;
      issued += 1;
      csrf = `csrf-token-${issued}`;
      activeMembershipId =
        world.memberships.length === 1 ? (world.memberships[0]?.id ?? null) : null;
      return reply(route, 200, session());
    }
    if (!signedIn) return reply(route, 401, PROBLEM(401, 'UNAUTHENTICATED'));

    if (path === '/auth/session' && request.method() === 'GET') return reply(route, 200, session());
    if (path === '/auth/session/membership') {
      activeMembershipId = body.membershipId;
      return reply(route, 200, session());
    }
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
    return reply(route, 404, PROBLEM(404, 'NOT_FOUND'));
  });

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

  return { requests };
}
