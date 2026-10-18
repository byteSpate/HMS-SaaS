import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Post,
  UseGuards,
  type CanActivate,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { bindRequestIdentity, getRequestContext, RequestPipelineModule } from '@hms/platform';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApp } from './configure-app.js';

// The API request pipeline over real HTTP, without a database (T-PLT-07, D section 8.6).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Stands in for SessionGuard: proves guards run inside the request context (layer 4 before 6).
@Injectable()
class FakeSessionGuard implements CanActivate {
  canActivate(): boolean {
    if (!getRequestContext()) throw new Error('guard ran outside the request context');
    bindRequestIdentity({ userId: 'user-1', tenantId: 'tenant-1', membershipId: 'member-1' });
    return true;
  }
}

@Controller('probe')
class ProbeController {
  @Get('context')
  @UseGuards(FakeSessionGuard)
  async context() {
    await new Promise((resolve) => setTimeout(resolve, 5));
    // Read after an await: the context must survive async continuations.
    return getRequestContext() ?? null;
  }

  @Get('missing')
  missing(): never {
    throw new NotFoundException();
  }

  @Post('echo')
  echo(@Body() body: { text: string }) {
    return { length: body.text.length };
  }
}

const logLines: Record<string, unknown>[] = [];

@Module({
  imports: [
    RequestPipelineModule.forRoot({
      level: 'info',
      destination: { write: (line: string) => void logLines.push(JSON.parse(line)) },
    }),
  ],
  controllers: [ProbeController],
})
class PipelineTestModule {}

describe('API request pipeline', () => {
  let app: NestExpressApplication;
  let base: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PipelineTestModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, 'http://localhost:3100');
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1/probe`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logLines.length = 0;
  });

  // The request log line is written on response finish, a moment after the client has the body.
  async function logLineFor(correlationId: string) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const line = logLines.find((entry) => entry.correlationId === correlationId);
      if (line) return line;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`no log line for ${correlationId}; got ${JSON.stringify(logLines)}`);
  }

  it('keeps a safe client X-Request-Id and echoes it', async () => {
    const res = await fetch(`${base}/context`, { headers: { 'X-Request-Id': 'abc-123' } });
    expect(res.headers.get('x-request-id')).toBe('abc-123');
    expect((await res.json()).correlationId).toBe('abc-123');
  });

  it('replaces a malformed X-Request-Id with a generated UUID', async () => {
    const res = await fetch(`${base}/context`, { headers: { 'X-Request-Id': 'bad id; forged' } });
    const id = res.headers.get('x-request-id') ?? '';
    expect(id).toMatch(UUID);
    expect((await res.json()).correlationId).toBe(id);
  });

  it('gives guards and handlers the request context, including the bound identity', async () => {
    const res = await fetch(`${base}/context`);
    expect(await res.json()).toMatchObject({
      correlationId: res.headers.get('x-request-id'),
      tenantId: 'tenant-1',
      userId: 'user-1',
      membershipId: 'member-1',
    });
  });

  it('puts the correlation ID into problem bodies', async () => {
    const res = await fetch(`${base}/missing`, { headers: { 'X-Request-Id': 'trace-404' } });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND', correlationId: 'trace-404' });
  });

  it('accepts a body above the framework default of 100 kb', async () => {
    const res = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(500_000) }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ length: 500_000 });
  });

  it('answers a body over 1 mb with PAYLOAD_TOO_LARGE and the correlation ID', async () => {
    const res = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'trace-413' },
      body: JSON.stringify({ text: 'x'.repeat(1_100_000) }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      status: 413,
      correlationId: 'trace-413',
    });
  });

  it('sends security headers but leaves HSTS to nginx', async () => {
    const res = await fetch(`${base}/context`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('strict-transport-security')).toBeNull();
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('writes one log line with IDs, path without query, status and duration', async () => {
    await fetch(`${base}/context?q=Salma%20Begum&phone=01711000000`, {
      headers: { 'X-Request-Id': 'trace-log', Cookie: 'hms_session=secret-token' },
    });
    const line = await logLineFor('trace-log');
    expect(line).toMatchObject({
      level: 30,
      correlationId: 'trace-log',
      tenantId: 'tenant-1',
      userId: 'user-1',
      req: { method: 'GET', path: '/api/v1/probe/context' },
      res: { statusCode: 200 },
    });
    expect(typeof line.durationMs).toBe('number');
    const text = JSON.stringify(line);
    expect(text).not.toContain('Salma');
    expect(text).not.toContain('01711000000');
    expect(text).not.toContain('secret-token');
  });

  it('logs client errors at warn level', async () => {
    await fetch(`${base}/missing`, { headers: { 'X-Request-Id': 'trace-warn' } });
    expect((await logLineFor('trace-warn')).level).toBe(40);
  });
});
