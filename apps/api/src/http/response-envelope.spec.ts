import { Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ApiEndpoint, PagedResult, RawResponse, RequestPipelineModule } from '@hms/platform';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { configureApp } from './configure-app.js';

// The success body shape over real HTTP (T-PLT-08; D sections 8.2 and 8.6; ADR-005).
const itemSchema = z.object({ id: z.string() });
const nestedSchema = z.object({ item: itemSchema, list: z.array(itemSchema) });
const CONTRACT = { status: 200, description: 'probe', schema: itemSchema };
const logLines: Record<string, unknown>[] = [];

@Controller('probe')
class EnvelopeProbeController {
  @Get('ok')
  @ApiEndpoint({ summary: 'ok', success: CONTRACT, errors: [] })
  ok() {
    return { id: 'a' };
  }

  @Get('undeclared')
  @ApiEndpoint({ summary: 'undeclared', success: CONTRACT, errors: [] })
  undeclared() {
    return { id: 'a', passwordHash: 'must never leave' };
  }

  @Get('nested-undeclared')
  @ApiEndpoint({
    summary: 'nested',
    success: { status: 200, description: 'probe', schema: nestedSchema },
    errors: [],
  })
  nestedUndeclared() {
    return { item: { id: 'a' }, list: [{ id: 'b', secret: 'must never leave' }] };
  }

  @Get('wrong-type')
  @ApiEndpoint({ summary: 'wrong', success: CONTRACT, errors: [] })
  wrongType() {
    return { id: 42 };
  }

  @Get('no-contract')
  noContract() {
    return { id: 'a' };
  }

  @Get('page')
  @ApiEndpoint({ summary: 'page', success: CONTRACT, errors: [] })
  page() {
    return new PagedResult([{ id: 'a' }, { id: 'b' }], 'next-page');
  }

  @Get('last-page')
  @ApiEndpoint({ summary: 'last', success: CONTRACT, errors: [] })
  lastPage() {
    return new PagedResult([{ id: 'a' }], null);
  }

  @Post('none')
  @HttpCode(204)
  @ApiEndpoint({ summary: 'none', success: { status: 204, description: 'none' }, errors: [] })
  none(): void {
    return undefined;
  }

  @Get('raw')
  @RawResponse()
  raw() {
    return { anything: true };
  }
}

@Module({
  imports: [
    RequestPipelineModule.forRoot({
      level: 'info',
      destination: { write: (line: string) => void logLines.push(JSON.parse(line)) },
    }),
  ],
  controllers: [EnvelopeProbeController],
})
class EnvelopeTestModule {}

describe('response envelope', () => {
  let app: NestExpressApplication;
  let base: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [EnvelopeTestModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, 'http://localhost:3100');
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1/probe`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('wraps a success as { data, meta.correlationId }', async () => {
    const res = await fetch(`${base}/ok`, { headers: { 'X-Request-Id': 'env-1' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: 'a' }, meta: { correlationId: 'env-1' } });
  });

  it.each(['undeclared', 'nested-undeclared'])(
    'answers 500 for a result with an undeclared field, and nothing leaks (%s)',
    async (route) => {
      const res = await fetch(`${base}/${route}`);
      const text = await res.text();
      expect(res.status).toBe(500);
      expect(JSON.parse(text)).toMatchObject({ code: 'INTERNAL_ERROR' });
      expect(text).not.toContain('must never leave');
    },
  );

  it('logs which field broke the contract, never its value', async () => {
    logLines.length = 0;
    await fetch(`${base}/undeclared`);
    const line = JSON.stringify(logLines);
    expect(line).toContain('passwordHash');
    expect(line).not.toContain('must never leave');
  });

  it('answers 500 for a result of the wrong type', async () => {
    const res = await fetch(`${base}/wrong-type`);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('answers 500 when a route returns JSON without declaring a contract', async () => {
    const res = await fetch(`${base}/no-contract`);
    expect(res.status).toBe(500);
  });

  it('carries meta.nextCursor on a list, checking each item', async () => {
    const res = await fetch(`${base}/page`, { headers: { 'X-Request-Id': 'env-2' } });
    expect(await res.json()).toEqual({
      data: [{ id: 'a' }, { id: 'b' }],
      meta: { correlationId: 'env-2', nextCursor: 'next-page' },
    });
  });

  it('gives a null cursor on the last page', async () => {
    const res = await fetch(`${base}/last-page`);
    expect(((await res.json()) as { meta: { nextCursor: unknown } }).meta.nextCursor).toBeNull();
  });

  it('leaves 204 without a body', async () => {
    const res = await fetch(`${base}/none`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:3100' },
    });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('leaves errors as problem details, not wrapped', async () => {
    const res = await fetch(`${base}/does-not-exist`);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe('NOT_FOUND');
    expect(body).not.toHaveProperty('data');
  });

  it('leaves a @RawResponse route untouched', async () => {
    const res = await fetch(`${base}/raw`);
    expect(await res.json()).toEqual({ anything: true });
  });
});
