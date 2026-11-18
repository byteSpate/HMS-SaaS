// Prescription line rows in PostgreSQL (T-CLI-03; FR-CLI-001, FR-CLI-006; FPR-06): one row per
// line of a signed version, with the medicine and the fulfilment choice, for the pharmacy
// (Phase 4). Append-only; runs in the caller's withTenant() transaction (ADR-003).
import type { PrescriptionLine } from '@hms/contracts';
import type { TenantTx } from '@hms/database';

export async function insertPrescriptionLines(
  tx: TenantTx,
  values: {
    tenantId: string;
    documentVersionId: string;
    patientId: string;
    lines: readonly PrescriptionLine[];
    at: Date;
  },
): Promise<void> {
  await tx.prescriptionLine.createMany({
    data: values.lines.map((line, index) => ({
      tenantId: values.tenantId,
      documentVersionId: values.documentVersionId,
      patientId: values.patientId,
      lineNo: index + 1,
      medicineId: line.medicineId,
      fulfilment: line.fulfilment,
      quantity: line.quantity,
      createdAt: values.at,
    })),
  });
}
