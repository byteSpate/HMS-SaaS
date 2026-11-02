// Effective-dated hospital settings (T-PLT-05; FR-CFG-002, FR-SAA-005; P-004; AT-CFG-001, -003).
// Versions are append-only: a change is a new version with a later effective time, so a record that
// used an older version keeps its meaning. Reads go to the database each time; there is no cache to
// go stale, and publishing emits an event so one can be added if load tests ever need it.
import {
  isPolicyKey,
  policyBodySchemas,
  type PolicyBody,
  type PolicyKey,
  type PolicyPreview,
  type PolicyVersionRow,
} from '@hms/contracts';
import type { Prisma, TenantTx } from '@hms/database';
import { DomainError } from '@hms/domain-kernel';
import { appendAuditEvent } from './audit.js';
import { appendOutboxEvent } from './outbox.js';

export interface PublishPolicyInput {
  tenantId: string;
  actorUserId: string;
  membershipId?: string;
  correlationId?: string;
  policyKey: string;
  body: Record<string, unknown>;
  effectiveFrom: Date;
  reason: string;
  now: Date;
}

export function assertPolicyKey(key: string): asserts key is PolicyKey {
  if (!isPolicyKey(key)) throw new DomainError('NOT_FOUND', 'Unknown policy');
}

/** Fails with one field entry per problem, so a screen can highlight inputs. */
export function parsePolicyBody<K extends PolicyKey>(key: K, body: unknown): PolicyBody<K> {
  const parsed = policyBodySchemas[key].safeParse(body);
  if (parsed.success) return parsed.data as PolicyBody<K>;
  throw new DomainError('VALIDATION_FAILED', 'The policy values are not valid', {
    fields: parsed.error.issues.map((issue) => ({
      path: ['body', ...issue.path].join('.'),
      message: issue.message,
    })),
  });
}

/** The human-readable change list of FR-CFG-002. */
export function diffPolicy(
  from: Record<string, unknown> | null,
  to: Record<string, unknown>,
): PolicyPreview['changes'] {
  const paths = new Set([...Object.keys(from ?? {}), ...Object.keys(to)]);
  return [...paths]
    .filter((path) => from?.[path] !== to[path])
    .map((path) => ({ path, from: from?.[path] ?? null, to: to[path] ?? null }));
}

function toRow(row: {
  id: string;
  policyKey: string;
  versionNo: number;
  effectiveFrom: Date;
  body: unknown;
  publishedBy: string | null;
  publishedAt: Date;
}): PolicyVersionRow {
  return {
    id: row.id,
    policyKey: row.policyKey,
    versionNo: row.versionNo,
    effectiveFrom: row.effectiveFrom.toISOString(),
    body: row.body as Record<string, unknown>,
    publishedBy: row.publishedBy,
    publishedAt: row.publishedAt.toISOString(),
  };
}

async function effectiveRow(tx: TenantTx, key: string, at: Date) {
  return tx.policyVersion.findFirst({
    where: { policyKey: key, effectiveFrom: { lte: at } },
    orderBy: [{ effectiveFrom: 'desc' }, { versionNo: 'desc' }],
  });
}

/** The version in force at a time, or null: nothing published yet, so the caller's default applies. */
export async function getEffectivePolicy<K extends PolicyKey>(
  tx: TenantTx,
  key: K,
  at: Date,
): Promise<PolicyBody<K> | null> {
  const row = await effectiveRow(tx, key, at);
  return row ? parsePolicyBody(key, row.body) : null;
}

export async function previewPolicy(
  tx: TenantTx,
  key: PolicyKey,
  body: unknown,
  at: Date,
): Promise<PolicyPreview> {
  const next = parsePolicyBody(key, body) as Record<string, unknown>;
  const current = await effectiveRow(tx, key, at);
  return { changes: diffPolicy(current?.body as Record<string, unknown> | null, next) };
}

export async function listPolicyVersions(
  tx: TenantTx,
  key: PolicyKey,
): Promise<PolicyVersionRow[]> {
  const rows = await tx.policyVersion.findMany({
    where: { policyKey: key },
    orderBy: { versionNo: 'desc' },
  });
  return rows.map(toRow);
}

export async function publishPolicyVersion(
  tx: TenantTx,
  input: PublishPolicyInput,
): Promise<PolicyVersionRow> {
  assertPolicyKey(input.policyKey);
  const body = parsePolicyBody(input.policyKey, input.body) as Prisma.InputJsonObject;
  if (input.effectiveFrom.getTime() < input.now.getTime()) {
    throw new DomainError('VALIDATION_FAILED', 'The effective time cannot be in the past', {
      fields: [{ path: 'effectiveFrom', message: 'Choose now or a future time' }],
    });
  }
  const current = await effectiveRow(tx, input.policyKey, input.now);
  // Serializes publishing per policy, so two admins cannot take the same version number.
  const lockName = `${input.tenantId}:${input.policyKey}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockName}))`;
  const latest = await tx.policyVersion.aggregate({
    where: { policyKey: input.policyKey },
    _max: { versionNo: true },
  });
  const row = await tx.policyVersion.create({
    data: {
      tenantId: input.tenantId,
      policyKey: input.policyKey,
      versionNo: (latest._max.versionNo ?? 0) + 1,
      effectiveFrom: input.effectiveFrom,
      body,
      publishedBy: input.actorUserId,
      publishedAt: input.now,
    },
  });
  const changes = diffPolicy(current?.body as Record<string, unknown> | null, input.body);
  await appendAuditEvent(tx, {
    tenantId: input.tenantId,
    action: 'config.policy.published',
    outcome: 'SUCCEEDED',
    actorUserId: input.actorUserId,
    ...(input.membershipId ? { membershipId: input.membershipId } : {}),
    targetType: 'policy_version',
    targetId: row.id,
    reason: input.reason,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    details: {
      policyKey: input.policyKey,
      versionNo: row.versionNo,
      effectiveFrom: input.effectiveFrom.toISOString(),
      changedFields: changes.map((change) => change.path).join(','),
    },
  });
  await appendOutboxEvent(tx, {
    tenantId: input.tenantId,
    eventType: 'config.policy.published',
    aggregateType: 'policy_version',
    aggregateId: row.id,
    payload: { policyKey: input.policyKey, versionNo: row.versionNo },
  });
  return toRow(row);
}
