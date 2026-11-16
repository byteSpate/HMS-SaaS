import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/prisma/client.js';

export { PrismaClient } from './generated/prisma/client.js';
export type * from './generated/prisma/client.js';
// The SQL NULL marker for a Json? column: a plain null is refused there (T-CLI-02 note draft).
export const DbNull = Prisma.DbNull;
export {
  withCommandTransaction,
  withTenant,
  withUserContext,
  type TenantContext,
  type TenantTx,
} from './with-tenant.js';

export interface PrismaClientOptions {
  /** Maximum pooled connections (pg default: 10). */
  maxConnections?: number;
}

// Prisma 7 needs a driver adapter. pg has no default connection timeout, so set one (D1 §4).
export function createPrismaClient(
  connectionString: string,
  options: PrismaClientOptions = {},
): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 5_000,
    ...(options.maxConnections ? { max: options.maxConnections } : {}),
  });
  return new PrismaClient({ adapter });
}
