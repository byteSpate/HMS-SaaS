// Scheduled cleanup (T-PLT-03; AT-PLT-004; D section 10 maintenance queue). hms_app cannot see across
// hospitals, so expired rows are removed by fixed functions that delete and return only a count.
// Retention values are PROPOSED: idempotency 7 days (D 9.3), outbox 30 days (E), sessions 30 days.
import type { PrismaClient } from '@hms/database';

const ENDED_SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface MaintenanceResult {
  idempotencyRecords: number;
  outboxEvents: number;
  sessions: number;
}

export async function runMaintenance(prisma: PrismaClient): Promise<MaintenanceResult> {
  const idempotency = await prisma.$queryRaw<{ removed: number }[]>`
    SELECT hms.purge_expired_idempotency_records() AS removed`;
  const outbox = await prisma.$queryRaw<{ removed: number }[]>`
    SELECT hms.purge_published_outbox_events() AS removed`;
  // Identity tables have no RLS (T-ACC-01), and hms_app may delete sessions.
  const sessions = await prisma.userSession.deleteMany({
    where: { absoluteExpiresAt: { lt: new Date(Date.now() - ENDED_SESSION_RETENTION_MS) } },
  });
  return {
    idempotencyRecords: Number(idempotency[0]?.removed ?? 0),
    outboxEvents: Number(outbox[0]?.removed ?? 0),
    sessions: sessions.count,
  };
}
