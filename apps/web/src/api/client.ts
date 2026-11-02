// Thin fetch wrapper for the NestJS API (ADR-002: all business reads and writes go through it).
// - the session is the HttpOnly cookie (credentials: 'include'); this code never sees it
// - state-changing requests carry the CSRF token the server issued for this session (ADR-021)
// - errors become ApiError with a stable code; responses are validated with the shared contracts
// - success bodies are { data, meta } (T-PLT-08), unwrapped here and nowhere else
// Implements: T-UI-02, T-PLT-08, ADR-004, ADR-021.
import { anySuccessEnvelopeSchema, problemSchema } from '@hms/contracts';
import { API_BASE_URL, API_PREFIX } from '../config';
import { ApiError, CLIENT_ERROR_CODES } from './errors';

let csrfToken: string | null = null;

/** Set after login or a session read; cleared on logout. Kept in memory only. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Validates and types the JSON body, usually `someSchema.parse`. Omit for 204 answers. */
  parse?: (data: unknown) => T;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const parsed = problemSchema.safeParse(await response.json());
    if (parsed.success) {
      return new ApiError(parsed.data.code, response.status, parsed.data);
    }
  } catch {
    // not JSON: fall through to the generic error
  }
  return new ApiError(CLIENT_ERROR_CODES.UNKNOWN, response.status);
}

/** One page of a keyset list (D section 8.2). */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

async function send(
  path: string,
  { method = 'GET', body }: Pick<RequestOptions<unknown>, 'method' | 'body'>,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
      method,
      headers,
      credentials: 'include',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(CLIENT_ERROR_CODES.NETWORK, 0);
  }

  if (!response.ok) throw await toApiError(response);
  return response;
}

export async function apiRequest<T = void>(
  path: string,
  { method = 'GET', body, parse }: RequestOptions<T> = {},
): Promise<T> {
  const response = await send(path, { method, body });
  if (response.status === 204 || !parse) return undefined as T;

  try {
    return parse(anySuccessEnvelopeSchema.parse(await response.json()).data);
  } catch {
    throw new ApiError(CLIENT_ERROR_CODES.INVALID_RESPONSE, response.status);
  }
}

/** Reads a keyset list: each item is checked, and the cursor comes from `meta`. */
export async function apiPage<T>(path: string, parseItem: (item: unknown) => T): Promise<Page<T>> {
  const response = await send(path, {});
  try {
    const { data, meta } = anySuccessEnvelopeSchema.parse(await response.json());
    if (!Array.isArray(data)) throw new Error('A list answer must hold an array');
    return { items: data.map(parseItem), nextCursor: meta.nextCursor ?? null };
  } catch {
    throw new ApiError(CLIENT_ERROR_CODES.INVALID_RESPONSE, response.status);
  }
}
