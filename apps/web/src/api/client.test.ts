import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiConditionalGet, apiRequest, setCsrfToken } from './client';
import { ApiError } from './errors';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setCsrfToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function enveloped(data: unknown): Response {
  return jsonResponse({ data, meta: { correlationId: 'test-request' } });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiRequest', () => {
  it('sends the session cookie and no CSRF header on a read', async () => {
    setCsrfToken('token-1');
    fetchMock.mockResolvedValue(enveloped({ ok: true }));
    await apiRequest('/auth/session', { parse: (data) => data });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4100/api/v1/auth/session');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined();
  });

  it('adds the CSRF token to state-changing requests', async () => {
    setCsrfToken('token-1');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await apiRequest('/auth/logout', { method: 'POST' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('token-1');
  });

  it('turns a problem+json answer into an ApiError with its stable code', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { type: 'about:blank', title: 'x', status: 401, code: 'INVALID_CREDENTIALS' },
        401,
      ),
    );
    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      status: 401,
    });
  });

  it('reports an unreachable server as a NETWORK error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await apiRequest('/auth/session').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('NETWORK');
  });

  it('hands only the data of the envelope to the contract check', async () => {
    fetchMock.mockResolvedValue(enveloped({ id: 'a' }));
    await expect(apiRequest('/x', { parse: (data) => data })).resolves.toEqual({ id: 'a' });
  });

  it('rejects a body without the envelope', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'a' }));
    await expect(apiRequest('/x', { parse: (data) => data })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('rejects an answer that does not match the contract', async () => {
    fetchMock.mockResolvedValue(enveloped({ unexpected: true }));
    const parse = (data: unknown): string => {
      if (typeof data !== 'object' || data === null || !('id' in data)) throw new Error('shape');
      return String((data as { id: unknown }).id);
    };
    await expect(apiRequest('/x', { parse })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('reports a non-JSON error body as UNKNOWN with the status', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 502 }));
    await expect(apiRequest('/x')).rejects.toMatchObject({ code: 'UNKNOWN', status: 502 });
  });
});

describe('apiConditionalGet (ADR-015)', () => {
  const parse = (data: unknown) => data as { n: number };

  it('reads the data and its ETag, sending no If-None-Match the first time', async () => {
    const answer = enveloped({ n: 1 });
    answer.headers.set('ETag', '"t1"');
    fetchMock.mockResolvedValue(answer);
    expect(await apiConditionalGet('/worklist', parse, null)).toEqual({
      unchanged: false,
      data: { n: 1 },
      etag: '"t1"',
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['If-None-Match']).toBeUndefined();
  });

  it('sends the last ETag and reports 304 as unchanged', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }));
    expect(await apiConditionalGet('/worklist', parse, '"t1"')).toEqual({ unchanged: true });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['If-None-Match']).toBe('"t1"');
  });
});
