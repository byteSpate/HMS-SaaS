// Clinical document rows in PostgreSQL (T-CLI-02 note, T-CLI-03 prescription; E section 3;
// FPR-06). A consultation has at most one document of each kind. Every function runs in the
// caller's withTenant() transaction, so RLS limits it to one hospital (ADR-003). Content is JSON
// in the database and is checked against the kind's shared contract on the way out, so a stored
// row that no longer matches it fails loudly instead of reaching a screen.
import { noteContentSchema, type NoteContent } from '@hms/contracts';
import { DbNull, type Prisma, type TenantTx } from '@hms/database';

export type DocumentKind = 'CONSULTATION_NOTE' | 'PRESCRIPTION';

/** Document content is a JSON object; each kind's contract says which. */
export type DocumentContent = Prisma.InputJsonObject;

export interface StoredVersion<C> {
  versionId: string;
  versionNo: number;
  content: C;
  signedBy: string;
  signedAt: Date;
  amendReason: string | null;
}

export interface StoredDocument<C> {
  documentId: string;
  status: 'DRAFT' | 'SIGNED';
  signedVersionNo: number;
  draft: C | null;
  draftSavedAt: Date | null;
  amendReason: string | null;
  version: number;
  /** Newest first. */
  versions: StoredVersion<C>[];
}

export type StoredNote = StoredDocument<NoteContent>;

export async function findDocumentOf<C>(
  tx: TenantTx,
  consultationId: string,
  kind: DocumentKind,
  parse: (content: unknown) => C,
): Promise<StoredDocument<C> | null> {
  const row = await tx.clinicalDocument.findFirst({
    where: { consultationId, kind },
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
    status: row.status as StoredDocument<C>['status'],
    signedVersionNo: row.signedVersionNo,
    draft: row.draft === null ? null : parse(row.draft),
    draftSavedAt: row.draftSavedAt,
    amendReason: row.amendReason,
    version: row.version,
    versions: row.versions.map((version) => ({
      versionId: version.id,
      versionNo: version.versionNo,
      content: parse(version.content),
      signedBy: version.signedBy,
      signedAt: version.signedAt,
      amendReason: version.amendReason,
    })),
  };
}

export function findNoteOf(tx: TenantTx, consultationId: string): Promise<StoredNote | null> {
  return findDocumentOf(tx, consultationId, 'CONSULTATION_NOTE', (content) =>
    noteContentSchema.parse(content),
  );
}

export async function insertDocument(
  tx: TenantTx,
  values: {
    tenantId: string;
    kind: DocumentKind;
    consultationId: string;
    visitId: string;
    patientId: string;
    authorUserId: string;
    draft: DocumentContent;
    at: Date;
  },
): Promise<void> {
  await tx.clinicalDocument.create({
    data: {
      tenantId: values.tenantId,
      kind: values.kind,
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

/** What a document command changes; `draft: null` clears the draft. */
export interface DocumentChange {
  status?: 'DRAFT' | 'SIGNED';
  signedVersionNo?: number;
  draft?: DocumentContent | null;
  draftSavedAt?: Date | null;
  amendReason?: string | null;
}

/**
 * Applies the change only if the document is still at `expectedVersion` (SP-03). The UPDATE locks
 * the row, so of two commands at once the second finds 0 rows.
 */
export async function updateDocument(
  tx: TenantTx,
  target: { documentId: string; expectedVersion: number; at: Date },
  change: DocumentChange,
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

/** Appends a signed version and returns its ID. */
export async function insertVersion(
  tx: TenantTx,
  values: {
    tenantId: string;
    documentId: string;
    versionNo: number;
    content: DocumentContent;
    signedBy: string;
    at: Date;
    amends: { versionId: string; reason: string } | null;
  },
): Promise<string> {
  const row = await tx.clinicalDocumentVersion.create({
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
    select: { id: true },
  });
  return row.id;
}

/** UC-CLI-01 step 5: the first signature moves the consultation to CONSULTED. */
export async function markConsulted(tx: TenantTx, consultationId: string, at: Date): Promise<void> {
  await tx.consultation.updateMany({
    where: { id: consultationId, status: 'IN_CONSULTATION' },
    data: { status: 'CONSULTED', completedAt: at, updatedAt: at, version: { increment: 1 } },
  });
}
