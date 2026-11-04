// Idempotent commands (T-PLT-01; FPR-08, SP-01, SP-02, SP-08; D section 9.3, section 8.6 layer 8).
// A route marked @Idempotent runs in one transaction with its idempotency record, so a crash or an
// error leaves neither the effect nor the record, and the retry simply runs again. Concurrent
// duplicates wait on the record's primary key, then get the finished answer.
import { createHash } from 'node:crypto';
import {
  applyDecorators,
  Inject,
  Injectable,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { ApiHeader } from '@nestjs/swagger';
import {
  withCommandTransaction,
  withTenant,
  type PrismaClient,
  type TenantTx,
} from '@hms/database';
import { DomainError } from '@hms/domain-kernel';
import type { OperationOutcome } from '@hms/contracts';
import { lastValueFrom, of, type Observable } from 'rxjs';
import { PRISMA } from './database.module.js';
import { getRequestContext } from './request-context.js';

const IDEMPOTENT_OPERATION = 'hms:idempotent-operation';
const KEY_HEADER = 'idempotency-key';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Marks a command route. `operation` names it in the record and in /operations/{key}. The header
 * is documented here, so every command shows it in Swagger and can be tried from there.
 */
export const Idempotent = (operation: string): MethodDecorator =>
  applyDecorators(
    SetMetadata(IDEMPOTENT_OPERATION, operation),
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description: 'A new UUID per action; send the same one when retrying it (SP-08)',
      schema: { type: 'string', format: 'uuid' },
    }),
  );

interface Scope {
  tenantId: string;
  userId: string;
}

interface Command extends Scope {
  key: string;
  operation: string;
  requestHash: Buffer;
}

type Claim = { kind: 'new' } | { kind: 'replay'; body: unknown };

interface StoredResponse {
  body?: unknown;
}

interface RequestParts {
  method: string;
  originalUrl: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}

/** The route is part of the hash, so a key cannot be reused on a different command. */
function hashRequest(request: RequestParts): Buffer {
  const content = `${request.method} ${request.originalUrl}\n${JSON.stringify(request.body ?? null)}`;
  return createHash('sha256').update(content).digest();
}

function keyFrom(request: RequestParts): string {
  const key = request.headers[KEY_HEADER];
  if (typeof key === 'string' && UUID.test(key)) return key;
  throw new DomainError('VALIDATION_FAILED', 'This command needs an Idempotency-Key', {
    fields: [{ path: 'Idempotency-Key', message: 'Send a UUID created for this action' }],
  });
}

function scopeFromContext(): Scope {
  const context = getRequestContext();
  if (context?.tenantId && context.userId) {
    return { tenantId: context.tenantId, userId: context.userId };
  }
  throw new DomainError('TENANT_NOT_SELECTED', 'Choose a hospital first');
}

function recordKey(command: Scope & { key: string }) {
  return {
    tenantId_actorUserId_idemKey: {
      tenantId: command.tenantId,
      actorUserId: command.userId,
      idemKey: command.key,
    },
  };
}

function insertRecord(tx: TenantTx, command: Command) {
  // ON CONFLICT DO NOTHING: this waits for a concurrent duplicate to commit or roll back.
  return tx.idempotencyRecord.createMany({
    data: [
      {
        tenantId: command.tenantId,
        actorUserId: command.userId,
        idemKey: command.key,
        operation: command.operation,
        requestHash: new Uint8Array(command.requestHash),
        status: 'IN_PROGRESS',
      },
    ],
    skipDuplicates: true,
  });
}

/** Takes the key, or says what to answer when it was already used. */
async function claimKey(tx: TenantTx, command: Command): Promise<Claim> {
  const inserted = await insertRecord(tx, command);
  if (inserted.count === 1) return { kind: 'new' };

  const existing = await tx.idempotencyRecord.findUniqueOrThrow({ where: recordKey(command) });
  if (existing.expiresAt.getTime() <= Date.now()) {
    await tx.idempotencyRecord.delete({ where: recordKey(command) });
    await insertRecord(tx, command);
    return { kind: 'new' };
  }
  if (!command.requestHash.equals(Buffer.from(existing.requestHash))) {
    throw new DomainError(
      'IDEMPOTENCY_KEY_REUSED',
      'This key was already used for a different request',
    );
  }
  return { kind: 'replay', body: (existing.response as StoredResponse | null)?.body };
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const operation = this.reflector.get<string | undefined>(
      IDEMPOTENT_OPERATION,
      context.getHandler(),
    );
    if (!operation) return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<RequestParts>();
    const command: Command = {
      ...scopeFromContext(),
      key: keyFrom(request),
      operation,
      requestHash: hashRequest(request),
    };
    // Looked up here because routes without the marker, and apps without a database, never need it.
    const prisma = this.moduleRef.get<PrismaClient>(PRISMA, { strict: false });
    const outcome = await withCommandTransaction(prisma, command, async (tx) => {
      const claim = await claimKey(tx, command);
      if (claim.kind === 'replay') return claim;
      const body = await lastValueFrom(next.handle(), { defaultValue: undefined });
      await tx.idempotencyRecord.update({
        where: recordKey(command),
        data: { status: 'COMPLETED', response: { body } as object },
      });
      return { kind: 'done' as const, body };
    });
    if (outcome.kind === 'replay') {
      http
        .getResponse<{ setHeader(name: string, value: string): void }>()
        .setHeader('Idempotent-Replay', 'true');
    }
    return of(outcome.body);
  }
}

/** The finished command of this user for a key, or null: not run, rolled back or expired. */
export async function findOperation(
  prisma: PrismaClient,
  key: string,
): Promise<OperationOutcome | null> {
  const scope = scopeFromContext();
  const record = await withTenant(prisma, scope, (tx) =>
    tx.idempotencyRecord.findUnique({ where: recordKey({ ...scope, key }) }),
  );
  if (!record || record.expiresAt.getTime() <= Date.now()) return null;
  const stored = record.response as StoredResponse | null;
  return {
    idempotencyKey: key,
    operation: record.operation,
    status: 'COMPLETED',
    result: (stored?.body as { data?: unknown } | undefined)?.data,
  };
}
