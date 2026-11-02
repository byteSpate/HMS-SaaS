// Audit search (T-PLT-02; FR-AUD-005; AT-AUD-005; SCR-24). Details hold IDs and codes only
// (FR-AUD-001), so they are safe to show to someone with audit.view.
import { z } from 'zod';

export const auditSearchQuerySchema = z.object({
  /** Exact username of a member of this hospital. */
  actor: z.string().trim().toLowerCase().min(1).optional(),
  /** Start of an action code: `admin.` finds every administration event. */
  action: z.string().trim().min(1).optional(),
  targetId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
});
export type AuditSearchQuery = z.infer<typeof auditSearchQuerySchema>;

export const auditEventSchema = z.object({
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  action: z.string(),
  outcome: z.enum(['SUCCEEDED', 'DENIED', 'FAILED']),
  actorUserId: z.uuid().nullable(),
  actorName: z.string().nullable(),
  targetType: z.string().nullable(),
  targetId: z.uuid().nullable(),
  reason: z.string().nullable(),
  correlationId: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
});
export type AuditEventRow = z.infer<typeof auditEventSchema>;
