// The Nest-module part of the API request pipeline (D section 8.6, layers 4 and 5): the request
// context middleware, and one structured log line per request via nestjs-pino with the
// correlation, tenant and user IDs. Also registers the response envelope (layer 8, T-PLT-08).
// T-PLT-07, NFR-OBS-001, FR-AUD-006.
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  Module,
  RequestMethod,
  type DynamicModule,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { SpanStatusCode } from '@opentelemetry/api';
import type { DestinationStream, Level, LevelWithSilent } from 'pino';
import type { Options } from 'pino-http';
import { IdempotencyInterceptor } from './idempotency.js';
import { httpRequestDuration } from './metrics.js';
import { REDACTED_LOG_PATHS } from './redaction.js';
import { requestTracer } from './telemetry.js';
import { resolveRequestId } from './request-context.js';
import { RequestContextMiddleware, type ContextualRequest } from './request-context.middleware.js';
import { ResponseEnvelopeInterceptor } from './response-envelope.js';

export { Logger as AppLogger } from 'nestjs-pino';

export interface RequestPipelineOptions {
  level?: Level;
  /** Where log lines go; stdout when omitted. Tests pass a stream to read them. */
  destination?: DestinationStream;
}

type LoggedRequest = IncomingMessage & ContextualRequest & { originalUrl?: string };

// Query strings can hold patient search terms (names, phone numbers), so only the path is
// logged (FR-AUD-006). Headers are never serialized, so cookies and tokens cannot leak either.
function pathOf(url: string | undefined): string {
  return (url ?? '').split('?')[0] ?? '';
}

function logLevel(
  request: IncomingMessage,
  response: ServerResponse,
  error?: Error,
): LevelWithSilent {
  const loggedRequest = request as LoggedRequest;
  // Proxy and deploy checks poll /health; logging each one would bury real traffic.
  if (pathOf(loggedRequest.originalUrl ?? request.url) === '/health') return 'debug';
  if (error || response.statusCode >= 500) return 'error';
  return response.statusCode >= 400 ? 'warn' : 'info';
}

interface RoutedRequest {
  method: string;
  baseUrl?: string;
  route?: { path?: string };
  correlationId?: string;
}

/** The route pattern, never the real path. Unknown paths share one label, so scans stay cheap. */
function routePattern(request: RoutedRequest): string {
  const path = request.route?.path;
  // The middleware itself sits on a catch-all route, so a path no handler took still reports that
  // pattern. No API route uses a wildcard.
  if (typeof path !== 'string' || path.includes('*')) return 'unmatched';
  return `${request.baseUrl ?? ''}${path}`;
}

/** Records one metric and one span per request when the response finishes (T-PLT-06). */
function requestObservabilityMiddleware(
  request: RoutedRequest,
  response: ServerResponse,
  next: () => void,
): void {
  const stop = httpRequestDuration.startTimer();
  const span = requestTracer().startSpan('http.request');
  response.once('finish', () => {
    const route = routePattern(request);
    stop({ method: request.method, route, status: String(response.statusCode) });
    span.setAttributes({
      'http.request.method': request.method,
      'http.route': route,
      'http.response.status_code': response.statusCode,
      'hms.correlation_id': request.correlationId ?? '',
    });
    if (response.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
  });
  next();
}

function pinoHttpOptions(level: Level): Options {
  return {
    level,
    redact: { paths: REDACTED_LOG_PATHS, censor: '[Redacted]' },
    genReqId: (request) => (request as LoggedRequest).correlationId ?? resolveRequestId(undefined),
    customAttributeKeys: { responseTime: 'durationMs' },
    serializers: {
      req: (request: { method: string; url: string }) => ({
        method: request.method,
        path: pathOf(request.url),
      }),
      res: (response: { statusCode: number }) => ({ statusCode: response.statusCode }),
    },
    // Evaluated when the response finishes, after SessionGuard has bound the identity.
    customProps: (request) => {
      const loggedRequest = request as LoggedRequest;
      const context = loggedRequest.requestContext;
      return {
        correlationId: loggedRequest.correlationId ?? String(request.id),
        ...(context?.tenantId ? { tenantId: context.tenantId } : {}),
        ...(context?.userId ? { userId: context.userId } : {}),
      };
    },
    customLogLevel: logLevel,
  };
}

@Module({})
export class RequestPipelineModule implements NestModule {
  static forRoot(options: RequestPipelineOptions = {}): DynamicModule {
    const pinoHttp = pinoHttpOptions(options.level ?? 'info');
    return {
      module: RequestPipelineModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: options.destination ? [pinoHttp, options.destination] : pinoHttp,
        }),
      ],
      // Registered in the order D section 8.6 lists them: a replay never reaches the envelope,
      // and the record stores the enveloped answer.
      providers: [
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
        { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, requestObservabilityMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
