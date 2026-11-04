-- National ID and other identity documents of a patient (T-PAT-03; FR-PAT-007, FR-PAT-011,
-- FR-AUD-003; E section 5.2; owner decision 2026-11-04: encrypt in the app). The database never
-- holds the value in the clear: value_ciphertext is AES-256-GCM sealed by the API with a key from
-- NID_ENCRYPTION_KEY, value_hash is an HMAC-SHA256 under a key derived from it, for exact lookup,
-- and value_last4 is the only part shown in lists (masked display).
CREATE TABLE hms.patient_identifier (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "value_ciphertext" BYTEA NOT NULL,
    "value_hash" BYTEA NOT NULL,
    "value_last4" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "patient_identifier_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "patient_identifier_patient_fkey" FOREIGN KEY ("tenant_id", "patient_id")
      REFERENCES hms.patient ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "patient_identifier_kind_check"
      CHECK ("kind" IN ('NID', 'BIRTH_REGISTRATION', 'PASSPORT', 'OTHER')),
    -- 12-byte IV and 16-byte tag at least; a 32-byte HMAC; at most four visible characters.
    CONSTRAINT "patient_identifier_ciphertext_check" CHECK (octet_length("value_ciphertext") > 28),
    CONSTRAINT "patient_identifier_hash_check" CHECK (octet_length("value_hash") = 32),
    CONSTRAINT "patient_identifier_last4_check" CHECK ("value_last4" ~ '^[0-9A-Za-z]{1,4}$')
);

-- One identifier of each kind per patient. The same NID on two patients is allowed: it is a
-- duplicate signal for review (FR-PAT-011), never merged or refused automatically.
CREATE UNIQUE INDEX "patient_identifier_tenant_id_patient_id_kind_key"
  ON hms.patient_identifier ("tenant_id", "patient_id", "kind");
CREATE INDEX "patient_identifier_tenant_id_kind_value_hash_idx"
  ON hms.patient_identifier ("tenant_id", "kind", "value_hash");

ALTER TABLE hms.patient_identifier ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.patient_identifier FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.patient_identifier
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- Recorded with the registration; changing it is an identity edit (T-PAT-04), which will grant
-- what it needs. No DELETE: the history of a patient's documents is kept.
REVOKE UPDATE ON hms.patient_identifier FROM hms_app;
