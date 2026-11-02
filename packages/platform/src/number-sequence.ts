// Allocates business numbers inside the caller's transaction (T-PLT-04; FR-CFG-003; E section 4).
// One atomic upsert per number: concurrent callers queue on the row, and a rollback returns the
// number. Numbering is unique per hospital; gap-free numbering is not promised (FR-CFG-003).
import type { TenantTx } from '@hms/database';
import { formatBusinessNumber } from '@hms/domain-kernel';

export interface BusinessNumberRequest {
  tenantId: string;
  /** For example MRN, or INV-SERVICE-2026 for a yearly sequence. */
  sequenceKey: string;
  /** CP-09 pattern, for example {PREFIX}-{seq:6}. */
  pattern: string;
  prefix?: string;
}

export async function allocateBusinessNumber(
  tx: TenantTx,
  request: BusinessNumberRequest,
): Promise<string> {
  const rows = await tx.$queryRaw<{ value: bigint }[]>`
    INSERT INTO hms.number_sequence (tenant_id, sequence_key, next_value)
    VALUES (${request.tenantId}::uuid, ${request.sequenceKey}, 2)
    ON CONFLICT (tenant_id, sequence_key)
    DO UPDATE SET next_value = hms.number_sequence.next_value + 1
    RETURNING next_value - 1 AS value`;
  const value = rows[0]?.value;
  if (value === undefined) throw new Error('The number sequence returned no value');
  return formatBusinessNumber(request.pattern, Number(value), request.prefix);
}
