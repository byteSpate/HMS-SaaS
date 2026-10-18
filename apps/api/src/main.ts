import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppLogger } from '@hms/platform';
import { configureApp } from './http/configure-app.js';

// Local development reads the repository .env; real environments set variables directly,
// and those always win over the file.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

async function bootstrap(): Promise<void> {
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HMS API')
    .setDescription('Hospital ERP SaaS API documentation')
    .setVersion('1.0')
    .addServer(`http://localhost:${port}`, 'Local development')
    .addServer(productionUrl, 'Production')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(port);
}

await bootstrap();
