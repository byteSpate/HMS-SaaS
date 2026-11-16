// Consultation note rows in PostgreSQL (T-CLI-02; E section 3; FPR-06). Every function runs in the
// caller's withTenant() transaction, so RLS limits it to one hospital (ADR-003). Content is JSON in
// the database and is checked against the shared contract on the way out, so a stored row that
// no longer matches it fails loudly instead of reaching a screen.
import { noteContentSchema, type NoteContent } from '@hms/contracts';
import { DbNull, type TenantTx } from '@hms/database';

export interface StoredVersion {
  versionId: string;
  versionNo: number;
  content: NoteContent;
  signedBy: string;
  signedAt: Date;
  amendReason: string | null;
}

export interface StoredNote {
  documentId: string;
  status: 'DRAFT' | 'SIGNED';
  signedVersionNo: number;
  draft: NoteContent | null;
  draftSavedAt: Date | null;
  amendReason: string | null;
  version: number;
  /** Newest first. */
  versions: StoredVersion[];
}

export async function findNoteOf(tx: TenantTx, consultationId: string): Promise<StoredNote | null> {
  const row = await tx.clinicalDocument.findFirst({
    where: { consultationId },
    select: {
      id: true,
      status: true,
      signedVersionNo: true,
      draft: true,
      draftSavedAt: true,
      amendReason: true,
      version: true,
      versions: {
        select: {
          id: true,
          versionNo: true,
          content: true,
          signedBy: true,
          signedAt: true,
          amendReason: true,
        },
        orderBy: { versionNo: 'desc' },
      },
    },
  });
  if (!row) return null;
  return {
    documentId: row.id,
    status: row.status as StoredNote['status'],
    signedVersionNo: row.signedVersionNo,
    draft: row.draft === null ? null : noteContentSchema.parse(row.draft),
    draftSavedAt: row.draftSavedAt,
    amendReason: row.amendReason,
    version: row.version,
    versions: row.versions.map((version) => ({
      versionId: version.id,
      versionNo: version.versionNo,
      content: noteContentSchema.parse(version.content),
      signedBy: version.signedBy,
      signedAt: version.signedAt,
      amendReason: version.amendReason,
    })),
  };
}

export async function insertNote(
  tx: TenantTx,
  values: {
    tenantId: string;
    consultationId: string;
    visitId: string;
    patientId: string;
    authorUserId: string;
    draft: NoteContent;
    at: Date;
  },
): Promise<void> {
  await tx.clinicalDocument.create({
    data: {
      tenantId: values.tenantId,
      consultationId: values.consultationId,
      visitId: values.visitId,
      patientId: values.patientId,
      authorUserId: values.authorUserId,
      draft: values.draft,
      draftSavedAt: values.at,
      createdAt: values.at,
      updatedAt: values.at,
    },
  });
}

/** What a note command changes; `draft: null` clears the draft. */
export interface NoteChange {
  status?: 'DRAFT' | 'SIGNED';
  signedVersionNo?: number;
  draft?: NoteContent | null;
  draftSavedAt?: Date | null;
  amendReason?: string | null;
}

/**
 * Applies the change only if the note is still at `expectedVersion` (SP-03). The UPDATE locks the
 * row, so of two commands at once the second finds 0 rows.
 */
export async function updateNote(
  tx: TenantTx,
  target: { documentId: string; expectedVersion: number; at: Date },
  change: NoteChange,
): Promise<number> {
  const { draft, ...rest } = change;
  const result = await tx.clinicalDocument.updateMany({
    where: { id: target.documentId, version: target.expectedVersion },
    data: {
      ...rest,
      ...(draft === undefined ? {} : { draft: draft === null ? DbNull : draft }),
      updatedAt: target.at,
      version: { increment: 1 },
    },
  });
  return result.count;
}

export async function insertVersion(
  tx: TenantTx,
  values: {
    tenantId: string;
    documentId: string;
    versionNo: number;
    content: NoteContent;
    signedBy: string;
    at: Date;
    amends: { versionId: string; reason: string } | null;
  },
): Promise<void> {
  await tx.clinicalDocumentVersion.create({
    data: {
      tenantId: values.tenantId,
      documentId: values.documentId,
      versionNo: values.versionNo,
      content: values.content,
      signedBy: values.signedBy,
      signedAt: values.at,
      amendsVersionId: values.amends?.versionId ?? null,
      amendReason: values.amends?.reason ?? null,
    },
  });
}

/** UC-CLI-01 step 5: the first signature moves the consultation to CONSULTED. */
export async function markConsulted(tx: TenantTx, consultationId: string, at: Date): Promise<void> {
  await tx.consultation.updateMany({
    where: { id: consultationId, status: 'IN_CONSULTATION' },
    data: { status: 'CONSULTED', completedAt: at, updatedAt: at, version: { increment: 1 } },
  });
}
