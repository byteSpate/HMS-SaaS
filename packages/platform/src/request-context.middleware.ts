// Nest middleware (D section 8.6, layer 4): opens the AsyncLocalStorage request context for the
// rest of the pipeline. The same object is kept on the request, because the request log line is
// written when the response finishes, outside the async context. T-PLT-07.
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { resolveRequestId, runWithRequestContext, type RequestContext } from './request-context.js';
import type { CorrelatedRequest } from './request-id.middleware.js';

export interface ContextualRequest extends CorrelatedRequest {
  requestContext?: RequestContext;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: ContextualRequest, _response: unknown, next: () => void): void {
    const context: RequestContext = {
      correlationId: request.correlationId ?? resolveRequestId(undefined),
    };
    request.requestContext = context;
    runWithRequestContext(context, next);
  }
}
