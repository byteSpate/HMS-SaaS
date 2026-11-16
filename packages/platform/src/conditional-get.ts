// Conditional GET for polled worklists (T-CLI-01; ADR-015; M section 4). The route's answer gets
// an ETag computed from its data, before the envelope adds the per-request correlation ID, so the
// same data always has the same tag. When the client's If-None-Match holds that tag the answer
// is 304 Not Modified without a body, which keeps the polling cost to the query, not the transfer
// or the client's render. Worklists hold patient names, so the browser must not store them:
// Cache-Control no-store, and the web client keeps the last tag itself and sends If-None-Match.
// The tag is compared here, not by Express's freshness check: a fetch() with If-None-Match also
// sends Cache-Control: no-cache (Fetch standard, "no-store" mode), which that check reads as a
// forced reload. Nest always replies 200 for a value, so a match is thrown as NotModified and the
// problem filter ends the response with 304.
import { createHash } from 'node:crypto';
import {
  applyDecorators,
  Injectable,
  UseInterceptors,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

/** A strong tag of the JSON form of the data: equal data, equal tag. */
export function entityTagOf(data: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify(data)).digest('base64url');
  return `"${digest.slice(0, 32)}"`;
}

interface HeaderTarget {
  setHeader(name: string, value: string): void;
}

interface ConditionalRequest {
  headers: Record<string, string | string[] | undefined>;
}

/** Thrown when the client already holds the current data; answered as 304 by the filter. */
export class NotModified extends Error {
  constructor(readonly entityTag: string) {
    super('Not modified');
    this.name = 'NotModified';
  }
}

/** RFC 9110 If-None-Match: a list of tags or "*"; weak tags compare by their opaque part. */
export function matchesIfNoneMatch(header: string | string[] | undefined, tag: string): boolean {
  if (header === undefined) return false;
  const tags = (Array.isArray(header) ? header.join(',') : header)
    .split(',')
    .map((part) => part.trim().replace(/^W\//, ''));
  return tags.includes('*') || tags.includes(tag);
}

@Injectable()
export class ConditionalGetInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<ConditionalRequest>();
    const response = http.getResponse<HeaderTarget>();
    return next.handle().pipe(
      map((result: unknown) => {
        const tag = entityTagOf(result);
        response.setHeader('ETag', tag);
        response.setHeader('Cache-Control', 'no-store');
        if (matchesIfNoneMatch(request.headers['if-none-match'], tag)) throw new NotModified(tag);
        return result;
      }),
    );
  }
}

/** For GET routes polled by a worklist (ADR-015): ETag and 304 Not Modified. */
export const ConditionalGet = (): MethodDecorator =>
  applyDecorators(UseInterceptors(ConditionalGetInterceptor));
