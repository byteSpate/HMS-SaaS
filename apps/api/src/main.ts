import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppLogger, startMetricsServer, startTelemetry } from '@hms/platform';
import { configureApp } from './http/configure-app.js';
import { buildOpenApiDocument } from './http/swagger.js';

// Local development reads the repository .env; real environments set variables directly,
// and those always win over the file.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

async function bootstrap(): Promise<void> {
  const telemetry = startTelemetry('hms-api', process.env);
  // Imported after .env is loaded, because AppModule reads the environment when it loads.
  const { AppModule } = await import('./app.module.js');
  // Logs written during startup are held until the pino logger replaces Nest's default one.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(AppLogger));
  configureApp(app, process.env.CORS_ORIGINS);
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 4100);
  // ADR-021 fixes the production API origin; API_PUBLIC_URL lets staging override it.
  const productionUrl = process.env.API_PUBLIC_URL ?? 'https://healthcareapi.bytespate.com';

  SwaggerModule.setup('docs', app, buildOpenApiDocument(app, { port, productionUrl }));

  await app.listen(port);
  // A private port (K section 5): reachable by Prometheus and Docker, never through nginx.
  const metrics = await startMetricsServer(Number(process.env.METRICS_PORT ?? 9464), () => ({
    healthy: true,
  }));
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void Promise.allSettled([metrics.close(), telemetry.shutdown()]);
    });
  }
}

await bootstrap();
