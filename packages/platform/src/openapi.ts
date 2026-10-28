// Swagger (OpenAPI) documentation from the shared Zod contracts, so the documented request and
// response shapes are the ones the API validates and returns (D section 8; Swagger at /docs).
// One decorator per endpoint: summary, body, success response and its problem+json errors.
import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  type SchemaObject,
} from '@nestjs/swagger';
import { errorCodes, problemSchema, type ErrorCode } from '@hms/contracts';
import { z, type ZodType } from 'zod';

/** Security scheme names registered on the document (see the API's swagger setup). */
export const SESSION_SECURITY = 'session';
export const CSRF_SECURITY = 'csrf';

type JsonSchema = Record<string, unknown>;

/**
 * Removes the long regular expression Zod adds to ISO date-time strings: `format: date-time`
 * already says it, and the pattern makes the Swagger page hard to read.
 */
function withoutDateTimePatterns(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutDateTimePatterns);
  if (node === null || typeof node !== 'object') return node;
  const entries = Object.entries(node as JsonSchema)
    .filter(([key]) => !(key === 'pattern' && (node as JsonSchema).format === 'date-time'))
    .map(([key, value]) => [key, withoutDateTimePatterns(value)]);
  return Object.fromEntries(entries);
}

/**
 * The OpenAPI 3.0 schema of a contract. `input` describes what a client may send (before
 * defaults and trimming), `output` what the API returns.
 */
export function openApiSchema(schema: ZodType, io: 'input' | 'output' = 'output'): SchemaObject {
  const json = z.toJSONSchema(schema, { target: 'openapi-3.0', io, unrepresentable: 'any' });
  // The JSON Schema dialect marker is not part of an OpenAPI schema object.
  const schemaObject = withoutDateTimePatterns(json) as JsonSchema;
  delete schemaObject.$schema;
  return schemaObject as SchemaObject;
}

const PROBLEM = openApiSchema(problemSchema);

export interface EndpointDoc {
  summary: string;
  description?: string;
  /** Request body contract; omit for routes without a body. */
  body?: ZodType;
  success: { status: number; description: string; schema?: ZodType };
  /** Error codes this route can answer with; grouped by HTTP status in the document. */
  errors: readonly ErrorCode[];
  /** Writes need the X-CSRF-Token header (ADR-021); login is a write without a session. */
  csrf?: boolean;
}

function errorResponses(codes: readonly ErrorCode[]): MethodDecorator[] {
  const byStatus = new Map<number, ErrorCode[]>();
  for (const code of codes) {
    const status = errorCodes[code];
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  return [...byStatus.entries()].map(([status, list]) =>
    ApiResponse({
      status,
      description: `problem+json with code ${list.join(' or ')}`,
      content: { 'application/problem+json': { schema: PROBLEM } },
    }),
  );
}

/** Documents one endpoint from its contracts. */
export function ApiEndpoint(doc: EndpointDoc): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: doc.summary,
      ...(doc.description ? { description: doc.description } : {}),
    }),
    ...(doc.body ? [ApiBody({ schema: openApiSchema(doc.body, 'input') })] : []),
    ApiResponse({
      status: doc.success.status,
      description: doc.success.description,
      ...(doc.success.schema ? { schema: openApiSchema(doc.success.schema) } : {}),
    }),
    ...errorResponses(doc.errors),
    ...(doc.csrf ? [ApiSecurity(CSRF_SECURITY)] : []),
  );
}
