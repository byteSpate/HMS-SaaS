import { createServer } from 'node:http';
import { Controller, Get, Module, Param, Post, Body } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  AppLogger,
  jobFailures,
  metricsRegistry,
  RawResponse,
  RequestPipelineModule,
  startMetricsServer,
  startTelemetry,
} from '@hms/platform';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from './configure-app.js';

// Log redaction, metrics and telemetry (T-PLT-06; NFR-OBS-001; FR-AUD-006; D section 8.6, K).
const SECRETS = {
  nid: '19901234567890123',
  password: 'correct-horse-password',
  cookie: 'hms_session=secret-session-cookie',
  token: 'secret-bearer-token',
};
const logLines: string[] = [];
const PATIENT_ID = 'patient-7f3a';

@RawResponse()
@Controller('probe')
class ObservabilityProbeController {
  constructor(private readonly logger: AppLogger) {}

  @Get('patients/:patientId')
  read(@Param('patientId') patientId: string) {
    return { patientId };
  }

  @Post('logs')
  logs(@Body() body: Record<string, unknown>) {
    // What a careless log call looks like: whole objects, at several depths.
    this.logger.error({ msg: 'probe', ...body });
    this.logger.error({ msg: 'nested', patient: body, request: { headers: body } });
    return { ok: true };
  }
}

@Module({
  imports: [
    RequestPipelineModule.forRoot({
      level: 'info',
      destination: { write: (line: string) => void logLines.push(line) },
    }),
  ],
  controllers: [ObservabilityProbeController],
})
class ObservabilityTestModule {}

describe('observability', () => {
  let app: NestExpressApplication;
  let base: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ObservabilityTestModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, 'http://localhost:3100');
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1/probe`;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('log redaction (FR-AUD-006, AT-AUD-006)', () => {
    it('keeps NID, password, cookie and tokens out of the logs', async () => {
      logLines.length = 0;
      const res = await fetch(`${base}/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3100',
          Cookie: SECRETS.cookie,
          Authorization: `Bearer ${SECRETS.token}`,
        },
        body: JSON.stringify({
          nid: SECRETS.nid,
          nationalId: SECRETS.nid,
          password: SECRETS.password,
          temporaryPassword: SECRETS.password,
          cookie: SECRETS.cookie,
          authorization: SECRETS.token,
          csrfToken: SECRETS.token,
          secret: SECRETS.token,
          recordId: 'kept-1',
        }),
      });
      expect(res.status).toBe(201);
      const logged = logLines.join('\n');
      expect(logged).toContain('kept-1');
      for (const secret of Object.values(SECRETS)) expect(logged).not.toContain(secret);
    });
  });

  describe('metrics', () => {
    it('counts requests by route pattern, never by the real ID', async () => {
      await fetch(`${base}/patients/${PATIENT_ID}?name=Rahima`);
      const text = await metricsRegistry.metrics();
      expect(text).toContain('hms_http_request_duration_seconds');
      expect(text).toContain('route="/api/v1/probe/patients/:patientId"');
      expect(text).not.toContain(PATIENT_ID);
      expect(text).not.toContain('Rahima');
    });

    it('labels an unknown path as unmatched, so scans cannot grow the metrics', async () => {
      await fetch(`${base}/does-not-exist-abc123`);
      const text = await metricsRegistry.metrics();
      expect(text).toContain('route="unmatched"');
      expect(text).not.toContain('does-not-exist-abc123');
    });

    it('serves /metrics and /health on its own port, and nothing else', async () => {
      jobFailures.inc({ queue: 'probe' });
      const server = await startMetricsServer(0, () => ({ healthy: true }));
      try {
        const url = `http://127.0.0.1:${server.port}`;
        const metrics = await fetch(`${url}/metrics`);
        expect(metrics.status).toBe(200);
        expect(await metrics.text()).toContain('hms_job_failures_total{queue="probe"}');
        expect((await fetch(`${url}/health`)).status).toBe(200);
        expect((await fetch(`${url}/other`)).status).toBe(404);
      } finally {
        await server.close();
      }
    });

    it('answers 503 on /health when the process reports a problem', async () => {
      const server = await startMetricsServer(0, () => ({ healthy: false, reason: 'stale' }));
      try {
        expect((await fetch(`http://127.0.0.1:${server.port}/health`)).status).toBe(503);
      } finally {
        await server.close();
      }
    });
  });

  describe('OpenTelemetry', () => {
    it('stays off without an endpoint', async () => {
      const telemetry = startTelemetry('hms-test', {});
      expect(telemetry.enabled).toBe(false);
      await telemetry.shutdown();
    });

    it('sends spans with the correlation ID to the configured endpoint', async () => {
      const received: string[] = [];
      const collector = createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          received.push(`${request.url} ${Buffer.concat(chunks).toString('utf8')}`);
          response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
        });
      });
      await new Promise<void>((resolve) => collector.listen(0, '127.0.0.1', resolve));
      const { port } = collector.address() as { port: number };
      const telemetry = startTelemetry('hms-test', {
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
      });
      expect(telemetry.enabled).toBe(true);
      await fetch(`${base}/patients/${PATIENT_ID}`, { headers: { 'X-Request-Id': 'trace-me-1' } });
      await telemetry.shutdown();
      await new Promise((resolve) => collector.close(resolve));
      expect(received.join('\n')).toContain('/v1/traces');
      expect(received.join('\n')).toContain('trace-me-1');
    });
  });
});
