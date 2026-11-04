import type { SessionResponse } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import { redirectTarget } from './use-access';

function session(
  activeMembershipId: string | null,
  mfa: SessionResponse['mfa'] = { required: false, enrolled: false, verified: false },
  passwordChangeRequired = false,
): SessionResponse {
  return {
    user: { id: '0199e0a0-0000-7000-8000-000000000001', displayName: 'A', preferredLang: 'en' },
    memberships: [],
    activeMembershipId,
    csrfToken: 't',
    idleExpiresAt: '2026-10-15T10:00:00.000Z',
    absoluteExpiresAt: '2026-10-15T20:00:00.000Z',
    mfa,
    passwordChangeRequired,
    permissions: [],
  };
}

const PENDING = { required: true, enrolled: true, verified: false };
const PASSED = { required: true, enrolled: true, verified: true };

const HOSPITAL = '0199e0a0-0000-7000-8000-0000000000aa';

describe('redirectTarget', () => {
  it('sends a signed-out visitor from protected screens to login', () => {
    expect(redirectTarget('hospital', null)).toBe('/login');
    expect(redirectTarget('account', null)).toBe('/login');
    expect(redirectTarget('anonymous', null)).toBeNull();
  });

  it('keeps a signed-in user off the login screen', () => {
    expect(redirectTarget('anonymous', session(HOSPITAL))).toBe('/');
    expect(redirectTarget('anonymous', session(null))).toBeNull();
  });

  it('sends a session without a hospital back to login (T-ACC-06)', () => {
    expect(redirectTarget('hospital', session(null))).toBe('/login');
    expect(redirectTarget('hospital', session(HOSPITAL))).toBeNull();
    expect(redirectTarget('account', session(null))).toBeNull();
  });
});

describe('redirectTarget: second factor (T-ACC-04, FR-ACC-006)', () => {
  it('sends a privileged session that has not passed MFA to the MFA screen', () => {
    expect(redirectTarget('hospital', session(HOSPITAL, PENDING))).toBe('/mfa');
    expect(redirectTarget('anonymous', session(HOSPITAL, PENDING))).toBe('/mfa');
    expect(redirectTarget('second-factor', session(HOSPITAL, PENDING))).toBeNull();
  });

  it('leaves the MFA screen once the factor is passed or not needed', () => {
    expect(redirectTarget('second-factor', session(HOSPITAL, PASSED))).toBe('/');
    expect(redirectTarget('second-factor', session(HOSPITAL))).toBe('/');
    expect(redirectTarget('hospital', session(HOSPITAL, PASSED))).toBeNull();
  });

  it('sends a session without a hospital back to login before the second factor', () => {
    expect(redirectTarget('second-factor', session(null, PENDING))).toBe('/login');
  });
});

describe('redirectTarget: temporary password (T-ACC-05, FR-ACC-007)', () => {
  it('sends a session with a temporary password to the change screen first', () => {
    expect(redirectTarget('hospital', session(HOSPITAL, PENDING, true))).toBe('/change-password');
    expect(redirectTarget('second-factor', session(HOSPITAL, PENDING, true))).toBe(
      '/change-password',
    );
  });
});
