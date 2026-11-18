-- Prescriptions (T-CLI-03; FR-CLI-001, FR-CLI-004, FR-CLI-006; UC-CLI-01 steps 4 and 5; C-012,
-- C-029, FPR-06; Q-067 interim). A prescription is the second kind of clinical document of a
-- consultation: it reuses clinical_document (draft, sign, amend with a reason) and
-- clinical_document_version (immutable signed content), so it follows the same rules as the note.
-- Each signed version also writes its lines to prescription_line, one row per line with the
-- medicine and the fulfilment choice, so the pharmacy (Phase 4) can find HOSPITAL_PHARMACY lines
-- and link a dispense to them. Signing creates no stock movement and no charge (FR-CLI-001).

-- A consultation has at most one document of each kind.
ALTER TABLE hms.clinical_document DROP CONSTRAINT "clinical_document_kind_check";
ALTER TABLE hms.clinical_document
  ADD CONSTRAINT "clinical_document_kind_check" CHECK ("kind" IN ('CONSULTATION_NOTE', 'PRESCRIPTION'));
DROP INDEX hms."clinical_document_tenant_id_consultation_id_key";
CREATE UNIQUE INDEX "clinical_document_tenant_id_consultation_id_kind_key"
  ON hms.clinical_document ("tenant_id", "consultation_id", "kind");

CREATE TABLE hms.prescription_line (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    -- The signed version the line belongs to; an amendment writes a new set of lines.
    "document_version_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "medicine_id" UUID NOT NULL,
    -- FR-CLI-006: HOSPITAL_PHARMACY becomes a pharmacy request; EXTERNAL never moves stock.
    "fulfilment" TEXT NOT NULL,
    -- Optional: how many units to supply; units are informational until Q-014.
    "quantity" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "prescription_line_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "prescription_line_tenant_id_document_version_id_fkey" FOREIGN KEY ("tenant_id", "document_version_id")
      REFERENCES hms.clinical_document_version ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "prescription_line_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id")
      REFERENCES hms.patient ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "prescription_line_tenant_id_medicine_id_fkey" FOREIGN KEY ("tenant_id", "medicine_id")
      REFERENCES hms.medicine ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "prescription_line_fulfilment_check" CHECK ("fulfilment" IN ('HOSPITAL_PHARMACY', 'EXTERNAL')),
    CONSTRAINT "prescription_line_line_no_check" CHECK ("line_no" >= 1),
    CONSTRAINT "prescription_line_quantity_check" CHECK ("quantity" IS NULL OR "quantity" BETWEEN 1 AND 9999)
);
CREATE UNIQUE INDEX "prescription_line_tenant_id_id_key" ON hms.prescription_line ("tenant_id", "id");
CREATE UNIQUE INDEX "prescription_line_version_line_no_key"
  ON hms.prescription_line ("tenant_id", "document_version_id", "line_no");
-- The pharmacy's queue later: a patient's hospital-pharmacy lines.
CREATE INDEX "prescription_line_patient_idx"
  ON hms.prescription_line ("tenant_id", "patient_id", "fulfilment");

ALTER TABLE hms.prescription_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.prescription_line FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.prescription_line
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- FPR-06: the lines of a signed version are never changed or deleted.
REVOKE UPDATE ON hms.prescription_line FROM hms_app;
