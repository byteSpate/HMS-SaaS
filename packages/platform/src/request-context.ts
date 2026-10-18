// Per-request context: the correlation ID from the first middleware, then tenant and user once
// SessionGuard resolves them. Kept in AsyncLocalStorage so logs, audit and job enqueueing can
// read it without passing it through every call. T-PLT-07, NFR-OBS-001, D section 8.6.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  correlationId: string;
  tenantId?: string;
  userId?: string;
  membershipId?: string;
}

export interface RequestIdentity {
  userId: string;
  tenantId: string | null;
  membershipId: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

// The ID is written to logs and append-only audit tables, so a client-sent value is kept only
// when it is a short token of safe characters; anything else is replaced (no log injection).
const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

export function resolveRequestId(candidate: unknown): string {
  return typeof candidate === 'string' && SAFE_REQUEST_ID.test(candidate)
    ? candidate
    : randomUUID();
}

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Adds the resolved session to the current context; a no-op outside a request. */
export function bindRequestIdentity(identity: RequestIdentity): void {
  const context = storage.getStore();
  if (!context) return;
  context.userId = identity.userId;
  if (identity.tenantId) context.tenantId = identity.tenantId;
  if (identity.membershipId) context.membershipId = identity.membershipId;
}
