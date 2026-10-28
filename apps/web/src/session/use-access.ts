'use client';
// Route guard for client screens. The session cookie belongs to the API origin, so the web
// server cannot see it (ADR-021); the screen asks the API who is here and redirects. This is a
// convenience: the API still enforces every request (ADR-002 point 3). Implements: T-UI-02.
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { type SessionData, useSession } from './use-session';

/**
 * anonymous: login screen. account: signed in, hospital not required. second-factor: the MFA
 * screen, for a session that still needs it (T-ACC-04). hospital: the shell.
 */
export type AccessLevel = 'anonymous' | 'account' | 'second-factor' | 'hospital';

export type AccessStatus = 'loading' | 'ready' | 'redirecting' | 'unreachable';

export interface Access {
  status: AccessStatus;
  session: SessionData | undefined;
  /** Asks the API again after the server could not be reached. */
  retry: () => void;
}

export function redirectTarget(required: AccessLevel, session: SessionData): string | null {
  if (session === null) return required === 'anonymous' ? null : '/login';
  // FR-ACC-006: a privileged role needs the second factor before the shell (the API refuses
  // every guarded route with MFA_REQUIRED until then).
  const needsSecondFactor = session.mfa.required && !session.mfa.verified;
  if (required === 'account') return null;
  if (session.activeMembershipId === null) return '/choose-hospital';
  if (required === 'second-factor') return needsSecondFactor ? null : '/';
  if (needsSecondFactor) return '/mfa';
  return required === 'anonymous' ? '/' : null;
}

export function useAccess(required: AccessLevel): Access {
  const router = useRouter();
  const query = useSession();
  const target = query.data === undefined ? null : redirectTarget(required, query.data);

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  const retry = () => void query.refetch();
  if (query.isError) return { status: 'unreachable', session: undefined, retry };
  if (query.data === undefined) return { status: 'loading', session: undefined, retry };
  if (target) return { status: 'redirecting', session: query.data, retry };
  return { status: 'ready', session: query.data, retry };
}
