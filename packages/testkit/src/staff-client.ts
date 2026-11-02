// HTTP helpers for API integration tests (T-ACC-03, T-ACC-04, T-ACC-05): sign in as staff and,
// for a privileged role, enrol the second factor the way the staff app makes them.
import { hospitalCodeOf } from './identity.js';
import { totpCode } from './totp.js';

export interface StaffSession {
  cookie: string;
  csrfToken: string;
}

export interface StaffClient {
  login(username: string, password: string): Promise<Response>;
  /** Signs in; enrols and passes MFA first when the session requires it. */
  sessionOf(username: string, password: string): Promise<StaffSession>;
  call(
    session: StaffSession,
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<Response>;
}

export function cookieOf(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

/**
 * The data of a success response (T-PLT-08). `any` on purpose: it mirrors Response.json(), and each
 * test states the shape it expects.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dataOf(res: Response): Promise<any> {
  return ((await res.json()) as { data: unknown }).data;
}

async function expectOk(res: Response, step: string): Promise<void> {
  if (res.ok) return;
  throw new Error(`${step} answered ${res.status}: ${await res.text()}`);
}

/** `now` must be the API's clock, so the TOTP code matches its time step. */
export function staffClient(base: string, origin: string, now: () => Date): StaffClient {
  function login(username: string, password: string) {
    return fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ hospitalCode: hospitalCodeOf(username), username, password }),
    });
  }

  function call(
    session: StaffSession,
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    return fetch(`${base}${path}`, {
      method,
      headers: {
        Cookie: session.cookie,
        Origin: origin,
        'X-CSRF-Token': session.csrfToken,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function sessionOf(username: string, password: string): Promise<StaffSession> {
    const res = await login(username, password);
    await expectOk(res, 'login');
    const body = (await dataOf(res)) as { csrfToken: string; mfa: { required: boolean } };
    const session = { cookie: cookieOf(res), csrfToken: body.csrfToken };
    if (!body.mfa.required) return session;

    const enrolment = await call(session, 'POST', '/auth/mfa/enrolment');
    await expectOk(enrolment, 'MFA enrolment');
    const { secret } = (await dataOf(enrolment)) as { secret: string };
    const confirmed = await call(session, 'POST', '/auth/mfa/enrolment/confirm', {
      code: totpCode(secret, now()),
    });
    await expectOk(confirmed, 'MFA confirmation');
    const result = (await dataOf(confirmed)) as { session: { csrfToken: string } };
    return { cookie: cookieOf(confirmed), csrfToken: result.session.csrfToken };
  }

  return { login, sessionOf, call };
}
