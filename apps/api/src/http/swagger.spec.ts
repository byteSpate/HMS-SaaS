import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from './configure-app.js';
import { buildOpenApiDocument } from './swagger.js';

// Every API endpoint is documented in Swagger (/docs): a summary, a tag, a success response and,
// for a write with a body, the request body. Building the document does not connect to the
// database.
const WRITE = new Set(['post', 'put', 'patch', 'delete']);

interface Operation {
  summary?: string;
  tags?: string[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
  security?: Record<string, unknown>[];
}

/** What is missing from one operation's documentation (empty when complete). */
function missingDocs(method: string, path: string, operation: Operation): string[] {
  const name = `${method.toUpperCase()} ${path}`;
  const statuses = Object.keys(operation.responses ?? {});
  // Login is the one write without a session, so it needs no CSRF token (only Origin).
  const needsCsrf = WRITE.has(method) && path !== '/api/v1/auth/login';
  return [
    ...(operation.summary ? [] : [`${name}: no summary`]),
    ...(operation.tags?.length ? [] : [`${name}: no tag`]),
    ...(statuses.some((status) => status.startsWith('2')) ? [] : [`${name}: no success response`]),
    ...(needsCsrf && !operation.security?.length ? [`${name}: no csrf security`] : []),
  ];
}

describe('Swagger document', () => {
  it('documents every endpoint under /api/v1', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, 'http://localhost:3100');
    const document = buildOpenApiDocument(app, { port: 4100, productionUrl: 'https://api.test' });

    const problems = Object.entries(document.paths)
      .filter(([path]) => path.startsWith('/api/v1/'))
      .flatMap(([path, item]) =>
        Object.entries(item).flatMap(([method, operation]) =>
          missingDocs(method, path, operation as Operation),
        ),
      );
    expect(problems).toEqual([]);
    // The auth and administration endpoints of T-ACC-01..05 are all present.
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/auth/login',
        '/api/v1/auth/password',
        '/api/v1/auth/mfa/verify',
        '/api/v1/admin/users',
        '/api/v1/admin/users/{userId}/lock',
        '/api/v1/admin/roles',
      ]),
    );
    const login = document.paths['/api/v1/auth/login']?.post;
    expect(login?.requestBody).toBeDefined();
    expect(Object.keys(login?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '401', '423', '429']),
    );
    expect(document.components?.securitySchemes).toHaveProperty('csrf');
    await app.close();
    // Compiling the whole AppModule takes several seconds on a slow machine.
  }, 30_000);
});
