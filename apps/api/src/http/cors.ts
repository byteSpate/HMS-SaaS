// CORS allow-list for the separate web origin (ADR-021). Only exact origins get CORS headers;
// credentials (the session cookie) are allowed for them.
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

export function parseCorsOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => {
      if (new URL(origin).origin !== origin) {
        throw new Error(`CORS_ORIGINS entry must be a bare origin like https://host: ${origin}`);
      }
      return origin;
    });
}

export function buildCorsOptions(allowedOrigins: readonly string[]): CorsOptions {
  const allowed = new Set(allowedOrigins);
  return {
    // Requests without an Origin header (curl, health checks) are not CORS requests.
    origin: (origin, callback) => callback(null, origin === undefined || allowed.has(origin)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    // If-None-Match and ETag: polled worklists answer 304 when unchanged (ADR-015, T-CLI-01).
    allowedHeaders: [
      'Content-Type',
      'X-CSRF-Token',
      'Idempotency-Key',
      'X-Request-Id',
      'If-None-Match',
    ],
    exposedHeaders: ['ETag'],
    maxAge: 7200,
  };
}
