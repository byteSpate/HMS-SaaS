// The Nest-module part of the API request pipeline (D section 8.6, layers 4 and 5): the request
// context middleware, and one structured log line per request via nestjs-pino with the
// correlation, tenant and user IDs. T-PLT-07, NFR-OBS-001, FR-AUD-006.
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  Module,
  RequestMethod,
  type DynamicModule,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream, Level, LevelWithSilent } from 'pino';
import type { Options } from 'pino-http';
import { resolveRequestId } from './request-context.js';
import { RequestContextMiddleware, type ContextualRequest } from './request-context.middleware.js';

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

function pinoHttpOptions(level: Level): Options {
  return {
    level,
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
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
