import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';

// Standalone composition root: BullMQ processors, outbox relay, adapters (D §5, ADR-006). No HTTP.
// Local development reads the repository .env, as the API does; real environments set variables
// directly, and those always win over the file.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
}

await bootstrap();
