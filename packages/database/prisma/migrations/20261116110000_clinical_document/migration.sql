-- Consultation notes (T-CLI-02; FR-CLI-003, FR-CLI-007; UC-CLI-01 steps 2 and 5, C1; UC-CLI-02;
-- C-029, FPR-06; Q-066 interim: free-text sections and the allergy tri-state, no coding).
-- clinical_document is the note of one consultation and holds the doctor's current draft, which
-- autosaves, can be discarded, and is seen only by its author. Signing appends an immutable
-- clinical_document_version (v1, v2, ...); an amendment is a new draft with a reason that signs as
-- the next version, linked to the one it amends. Signed versions are never changed or deleted.

CREATE TABLE hms.clinical_document (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "consultation_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CONSULTATION_NOTE',
    "author_user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    -- 0 until the first signature.
    "signed_version_no" INTEGER NOT NULL DEFAULT 0,
    "draft" JSONB,
    "draft_saved_at" TIMESTAMPTZ,
    -- The reason of the amendment being drafted; null for the first draft.
    "amend_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "clinical_document_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "clinical_document_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Composite keys keep every reference inside the hospital (ADR-003).
    CONSTRAINT "clinical_document_tenant_id_consultation_id_fkey" FOREIGN KEY ("tenant_id", "consultation_id")
      REFERENCES hms.consultation ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "clinical_document_tenant_id_visit_id_fkey" FOREIGN KEY ("tenant_id", "visit_id")
      REFERENCES hms.visit ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "clinical_document_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id")
      REFERENCES hms.patient ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "clinical_document_kind_check" CHECK ("kind" IN ('CONSULTATION_NOTE')),
    CONSTRAINT "clinical_document_status_check" CHECK ("status" IN ('DRAFT', 'SIGNED')),
    CONSTRAINT "clinical_document_signed_version_no_check" CHECK ("signed_version_no" >= 0),
    -- SIGNED means a signed version and no open draft.
    CONSTRAINT "clinical_document_signed_check" CHECK (
      "status" <> 'SIGNED' OR ("signed_version_no" >= 1 AND "draft" IS NULL AND "amend_reason" IS NULL)
    ),
    -- An amendment draft always amends a signed version.
    CONSTRAINT "clinical_document_amend_check" CHECK ("amend_reason" IS NULL OR "signed_version_no" >= 1),
    CONSTRAINT "clinical_document_version_check" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "clinical_document_tenant_id_id_key" ON hms.clinical_document ("tenant_id", "id");
-- One note per consultation.
CREATE UNIQUE INDEX "clinical_document_tenant_id_consultation_id_key"
  ON hms.clinical_document ("tenant_id", "consultation_id");
-- A patient's notes, for the patient record later.
CREATE INDEX "clinical_document_patient_idx" ON hms.clinical_document ("tenant_id", "patient_id");

CREATE TABLE hms.clinical_document_version (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "signed_by" UUID NOT NULL,
    "signed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amends_version_id" UUID,
    "amend_reason" TEXT,

    CONSTRAINT "clinical_document_version_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "clinical_document_version_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "clinical_document_version_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id")
      REFERENCES hms.clinical_document ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "clinical_document_version_version_no_check" CHECK ("version_no" >= 1),
    -- v1 amends nothing; every later version amends one, with a reason (FR-CLI-003).
    CONSTRAINT "clinical_document_version_amends_check" CHECK (
      ("version_no" = 1) = ("amends_version_id" IS NULL)
      AND ("amends_version_id" IS NULL) = ("amend_reason" IS NULL)
    )
);
CREATE UNIQUE INDEX "clinical_document_version_tenant_id_id_key"
  ON hms.clinical_document_version ("tenant_id", "id");
CREATE UNIQUE INDEX "clinical_document_version_document_version_no_key"
  ON hms.clinical_document_version ("tenant_id", "document_id", "version_no");
-- The version an amendment amends, inside the hospital; added after the unique index it needs.
ALTER TABLE hms.clinical_document_version
  ADD CONSTRAINT "clinical_document_version_tenant_id_amends_version_id_fkey"
    FOREIGN KEY ("tenant_id", "amends_version_id")
    REFERENCES hms.clinical_document_version ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE hms.clinical_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.clinical_document FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.clinical_document
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());
ALTER TABLE hms.clinical_document_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.clinical_document_version FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.clinical_document_version
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- The note's draft and state change; whose note, of which consultation, never does. No DELETE.
REVOKE UPDATE ON hms.clinical_document FROM hms_app;
GRANT UPDATE (status, signed_version_no, draft, draft_saved_at, amend_reason, updated_at, version)
  ON hms.clinical_document TO hms_app;
-- FPR-06: a signed version is never changed or deleted.
REVOKE UPDATE ON hms.clinical_document_version FROM hms_app;
