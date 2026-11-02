// Valkey connections for BullMQ and rate limits (T-PLT-03; ADR-020; D section 10). Workers must
// keep retrying through an outage, so maxRetriesPerRequest is null as BullMQ requires. Producers
// fail fast, so an API request gets an error instead of hanging while Valkey is down.
import { Redis } from 'ioredis';

export type ValkeyRole = 'worker' | 'producer';

export function createValkeyConnection(url: string, role: ValkeyRole): Redis {
  const connection = new Redis(
    url,
    role === 'worker'
      ? { maxRetriesPerRequest: null }
      : { maxRetriesPerRequest: 1, enableOfflineQueue: false },
  );
  // ioredis throws on an unhandled error event; reconnecting is its own job, so note it and go on.
  connection.on('error', (error: Error) => {
    process.stderr.write(`Valkey connection error: ${error.message}\n`);
  });
  return connection;
}
