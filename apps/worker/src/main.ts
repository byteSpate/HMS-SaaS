import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { startMetricsServer, startTelemetry } from '@hms/platform';
import { JobRuntime } from './job-runtime.js';
import { WorkerModule } from './worker.module.js';

// Standalone composition root: BullMQ processors, outbox relay, adapters (D §5, ADR-006). No HTTP.
// Local development reads the repository .env, as the API does; real environments set variables
// directly, and those always win over the file.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

async function bootstrap(): Promise<void> {
  const telemetry = startTelemetry('hms-worker', process.env);
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  const runtime = app.get(JobRuntime);
  const metrics = await startMetricsServer(
    Number(process.env.WORKER_HEALTH_PORT ?? process.env.METRICS_PORT ?? 9464),
    () => runtime.health(),
  );
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void Promise.allSettled([metrics.close(), telemetry.shutdown()]);
    });
  }
}

await bootstrap();
