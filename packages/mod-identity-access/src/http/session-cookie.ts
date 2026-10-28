// Session cookie settings (ADR-004, ADR-021). No Domain attribute: the cookie stays on the API
// host and is never sent to other *.bytespate.com sites. The __Host- prefix makes browsers
// refuse a lookalike cookie set from a sibling subdomain (cookie tossing); it requires Secure,
// Path=/ and no Domain, which is exactly what is set here.
import type { CookieOptions, Response } from 'express';

export const SESSION_COOKIE = '__Host-hms_session';

const BASE_OPTIONS: CookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };

export function sessionCookieOptions(absoluteExpiresAt: Date, now: Date): CookieOptions {
  return { ...BASE_OPTIONS, maxAge: Math.max(0, absoluteExpiresAt.getTime() - now.getTime()) };
}

export const clearSessionCookieOptions: CookieOptions = BASE_OPTIONS;

/** Sets the cookie of a newly issued session (login, hospital switch, second factor). */
export function setSessionCookie(
  response: Response,
  issued: { token: string; session: { absoluteExpiresAt: string } },
  now = new Date(),
): void {
  const absolute = new Date(issued.session.absoluteExpiresAt);
  response.cookie(SESSION_COOKIE, issued.token, sessionCookieOptions(absolute, now));
}
