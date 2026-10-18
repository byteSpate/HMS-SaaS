// First middleware of the API (D section 8.6, layer 1): gives every request a correlation ID,
// echoes it in X-Request-Id and keeps it on the request. It runs before body parsing, so even
// a rejected body (413, malformed JSON) gets an ID in its problem response. T-PLT-07.
import { resolveRequestId } from './request-context.js';

export interface CorrelatedRequest {
  headers: Record<string, string | string[] | undefined>;
  correlationId?: string;
}

interface HeaderWritable {
  setHeader(name: string, value: string): unknown;
}

export function requestIdMiddleware(
  request: CorrelatedRequest,
  response: HeaderWritable,
  next: () => void,
): void {
  const correlationId = resolveRequestId(request.headers['x-request-id']);
  request.correlationId = correlationId;
  response.setHeader('X-Request-Id', correlationId);
  next();
}
