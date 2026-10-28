'use client';
// Session state for the app: one cached query (the session read) and the actions that change it.
// The cache holds the only copy of what the UI knows about the user, so logout and expiry clear
// it completely (ADR-002 evidence: logout clears client caches). Implements: T-UI-02, ADR-004.
import type { LoginRequest, MfaVerifyRequest, SessionResponse } from '@hms/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { setCsrfToken } from '../api/client';
import { ApiError } from '../api/errors';

export const SESSION_QUERY_KEY = ['session'] as const;

export type SessionData = SessionResponse | null;

async function loadSession(): Promise<SessionData> {
  try {
    const session = await authApi.session();
    setCsrfToken(session.csrfToken);
    return session;
  } catch (error) {
    // 401 means "nobody is signed in": a normal answer, not a failure.
    if (error instanceof ApiError && error.status === 401) {
      setCsrfToken(null);
      return null;
    }
    throw error;
  }
}

/** Reads (and fetches when needed) the session. Use on screens that need to know who is here. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: loadSession,
    staleTime: 60_000,
    retry: false,
  });
}

/** Reads the session cache without fetching; for components that only react to it. */
export function useCachedSession(): SessionData | undefined {
  return useQuery<SessionData>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: loadSession,
    enabled: false,
  }).data;
}

export function useSessionActions() {
  const queryClient = useQueryClient();

  function keep(session: SessionResponse): SessionResponse {
    setCsrfToken(session.csrfToken);
    queryClient.setQueryData<SessionData>(SESSION_QUERY_KEY, session);
    return session;
  }

  /** Forgets everything the UI knows: used after logout and when the session has ended. */
  function forget(): void {
    setCsrfToken(null);
    queryClient.clear();
    queryClient.setQueryData<SessionData>(SESSION_QUERY_KEY, null);
  }

  const login = useMutation({
    mutationFn: (body: LoginRequest) => authApi.login(body),
    onSuccess: keep,
  });
  const selectMembership = useMutation({
    mutationFn: (membershipId: string) => authApi.selectMembership(membershipId),
    onSuccess: keep,
  });
  const updateLanguage = useMutation({
    mutationFn: (preferredLang: 'bn-BD' | 'en') => authApi.updatePreferences(preferredLang),
    onSuccess: keep,
  });
  const logout = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: forget,
  });
  // T-ACC-04: the confirmed session is not cached yet, only its CSRF token is taken (the cookie
  // has already rotated). The MFA screen first shows the recovery codes, then calls `keep`;
  // caching earlier would let the route guard leave the screen before the codes are seen.
  const confirmMfa = useMutation({
    mutationFn: (code: string) => authApi.confirmMfaEnrolment(code),
    onSuccess: (result) => setCsrfToken(result.session.csrfToken),
  });
  const verifyMfa = useMutation({
    mutationFn: (body: MfaVerifyRequest) => authApi.verifyMfa(body),
    onSuccess: keep,
  });

  return { login, selectMembership, updateLanguage, logout, forget, keep, confirmMfa, verifyMfa };
}
