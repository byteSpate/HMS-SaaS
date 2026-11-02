// Transaction helpers that set the RLS context (ADR-003, E section 6.2). Settings are
// transaction-local (set_config(..., true)), so they end with the transaction and never
// leak to the next user of a pooled connection.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma, PrismaClient } from './generated/prisma/client.js';

export interface TenantContext {
  tenantId: string;
  userId?: string;
}

export type TenantTx = Prisma.TransactionClient;

const commandTransaction = new AsyncLocalStorage<{ tenantId: string; tx: TenantTx }>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, name: string): void {
  if (!UUID.test(value)) throw new Error(`${name} must be a UUID`);
}

async function runInContext<T>(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true),
                                  set_config('app.user_id', ${userId}, true)`;
      return fn(tx);
    },
    // maxWait: how long to wait for a free pooled connection (Prisma's default is 2 s).
    // timeout: how long the transaction itself may run.
    { maxWait: 5_000, timeout: 5_000, isolationLevel: 'ReadCommitted' },
  );
}

/** Runs `fn` with RLS scoped to one hospital. Every tenant-data query must run inside this. */
export async function withTenant<T>(
  prisma: PrismaClient,
  ctx: TenantContext,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  assertUuid(ctx.tenantId, 'withTenant: tenantId');
  if (ctx.userId !== undefined) assertUuid(ctx.userId, 'withTenant: userId');
  const command = commandTransaction.getStore();
  if (command) {
    // One command is one transaction (D section 9.1). A different hospital can never join it.
    if (command.tenantId !== ctx.tenantId) {
      throw new Error('withTenant: a command transaction cannot change hospital');
    }
    return fn(command.tx);
  }
  return runInContext(prisma, ctx.tenantId, ctx.userId ?? '', fn);
}

/**
 * Opens the transaction of one command. Every withTenant call inside `fn` joins it, so services
 * need no change to commit or roll back together with the idempotency record (T-PLT-01).
 */
export async function withCommandTransaction<T>(
  prisma: PrismaClient,
  ctx: Required<TenantContext>,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  assertUuid(ctx.tenantId, 'withCommandTransaction: tenantId');
  assertUuid(ctx.userId, 'withCommandTransaction: userId');
  return runInContext(prisma, ctx.tenantId, ctx.userId, (tx) =>
    commandTransaction.run({ tenantId: ctx.tenantId, tx }, () => fn(tx)),
  );
}

/**
 * Runs `fn` with only the user set and no hospital: used at login to list the user's own
 * memberships. Tenant tables stay invisible except where a policy allows the own user.
 */
export async function withUserContext<T>(
  prisma: PrismaClient,
  userId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  assertUuid(userId, 'withUserContext: userId');
  return runInContext(prisma, '', userId, fn);
}
