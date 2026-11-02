// Global success response handling (T-PLT-08; D sections 8.2 and 8.6 layer 8; ADR-005, NFR-OBS-001).
// Checks a handler's result against the contract its route declares, then wraps it as
// { data, meta }. A result that breaks its contract is logged and becomes 500 INTERNAL_ERROR, so a
// database row or an internal field can never leave the API by accident.
import {
  Inject,
  Injectable,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { map, type Observable } from 'rxjs';
import { z, type ZodType } from 'zod';
import { getRequestContext } from './request-context.js';

export const RESPONSE_CONTRACT = 'hms:response-contract';
const RAW_RESPONSE = 'hms:raw-response';

/** For routes that do not answer with enveloped JSON, such as /health and file downloads. */
export const RawResponse = (): ClassDecorator & MethodDecorator => SetMetadata(RAW_RESPONSE, true);

/** One page of a keyset list; the route's contract describes each item (D section 8.2). */
export class PagedResult<T> {
  constructor(
    readonly items: T[],
    readonly nextCursor: string | null,
  ) {}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Paths present in what the handler sent but dropped by the schema. Zod strips unknown keys
 * silently, which would hide a handler that returns more than its contract says.
 */
export function undeclaredPaths(sent: unknown, kept: unknown, path = ''): string[] {
  if (Array.isArray(sent) && Array.isArray(kept)) {
    return sent.flatMap((item, index) => undeclaredPaths(item, kept[index], `${path}[${index}]`));
  }
  if (!isPlainObject(sent) || !isPlainObject(kept)) return [];
  return Object.entries(sent).flatMap(([key, value]) => {
    const next = path ? `${path}.${key}` : key;
    return key in kept ? undeclaredPaths(value, kept[key], next) : [next];
  });
}

/** Field paths and rule codes only: values may hold patient data and never reach the log. */
function checkContract(schema: ZodType, result: unknown): { data: unknown; problems: string[] } {
  const parsed = schema.safeParse(result);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.code}`);
    return { data: undefined, problems };
  }
  const undeclared = undeclaredPaths(result, parsed.data);
  return { data: parsed.data, problems: undeclared.map((path) => `${path}: undeclared`) };
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, targets)) return next.handle();
    const schema = this.reflector.get<ZodType | undefined>(RESPONSE_CONTRACT, context.getHandler());
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    return next.handle().pipe(
      // A route without a body, such as 204, stays without one.
      map((result: unknown) =>
        result === undefined ? undefined : this.wrap(result, schema, route),
      ),
    );
  }

  private wrap(result: unknown, schema: ZodType | undefined, route: string) {
    if (!schema) return this.refuse(route, ['route returned JSON without a declared contract']);
    const page = result instanceof PagedResult ? result : undefined;
    const { data, problems } = page
      ? checkContract(z.array(schema), page.items)
      : checkContract(schema, result);
    if (problems.length > 0) return this.refuse(route, problems);
    return {
      data,
      meta: {
        correlationId: getRequestContext()?.correlationId,
        ...(page ? { nextCursor: page.nextCursor } : {}),
      },
    };
  }

  private refuse(route: string, problems: string[]): never {
    this.logger.error({ msg: 'A response broke its contract', route, problems });
    // A plain Error: the problem filter answers INTERNAL_ERROR and sends no details to the client.
    throw new Error('A response broke its contract');
  }
}
