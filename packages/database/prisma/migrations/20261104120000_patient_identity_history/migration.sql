-- Identity corrections with history (T-PAT-04; UC-PAT-02; FR-PAT-008; C-029; SP-03). Patient ID and
-- MRN never change; the other identity fields change only through a correction with a reason,
-- which keeps the previous values here. Who may correct is permission-gated (Q-036 interim).
CREATE TABLE hms.patient_identity_history (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    -- The version the previous values belonged to; the correction made version + 1.
    "version" INTEGER NOT NULL,
    "changed_fields" TEXT[] NOT NULL,
    -- Previous values of the changed fields only, as entered. A previous NID is never here in the
    -- clear: only its last four digits, with the sealed value in previous_nid_ciphertext.
    "previous_values" JSONB NOT NULL,
    "previous_nid_ciphertext" BYTEA,
    "reason" TEXT NOT NULL,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" UUID NOT NULL,

    CONSTRAINT "patient_identity_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "patient_identity_history_patient_fkey" FOREIGN KEY ("tenant_id", "patient_id")
      REFERENCES hms.patient ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "patient_identity_history_fields_check" CHECK (cardinality("changed_fields") > 0),
    CONSTRAINT "patient_identity_history_reason_check" CHECK (length(btrim("reason")) >= 3)
);

-- One row per version: two corrections can never both claim to replace the same version.
CREATE UNIQUE INDEX "patient_identity_history_tenant_id_patient_id_version_key"
  ON hms.patient_identity_history ("tenant_id", "patient_id", "version");

ALTER TABLE hms.patient_identity_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.patient_identity_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.patient_identity_history
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- Append-only (ADR-009): history is never rewritten.
REVOKE UPDATE ON hms.patient_identity_history FROM hms_app;

-- The editable columns only. tenant_id, id, mrn, identity_status, created_* stay out of reach, so
-- even a bug in the app cannot change who a record belongs to or its MRN.
GRANT UPDATE (name_bn, name_en, sex, birth_date, birth_date_precision, birth_year,
              reported_age_years, reported_age_on, phone_raw, phone_normalized, address_text,
              version)
  ON hms.patient TO hms_app;
GRANT UPDATE (value_ciphertext, value_hash, value_last4) ON hms.patient_identifier TO hms_app;
