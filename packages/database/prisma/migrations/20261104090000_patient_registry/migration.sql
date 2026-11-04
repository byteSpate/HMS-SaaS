-- Patient registry (T-PAT-01; FR-PAT-001, -002, -005, -006, -009, -011; C-033, C-034; E section 5.1).
-- One row per patient, owned by one hospital. MRN and id never change (FR-PAT-008), so the app
-- gets no UPDATE here; identity edits (T-PAT-04) will grant the editable columns only.

-- pg_trgm is created by an administrator (docker/postgres/supabase/30-pg-trgm.sql, or initdb
-- locally), because hms_migrator cannot create extensions. Stop early with a clear message.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension
    WHERE extname = 'pg_trgm' AND extnamespace = 'hms'::regnamespace
  ) THEN
    RAISE EXCEPTION 'pg_trgm must exist in schema hms: run docker/postgres/supabase/30-pg-trgm.sql as postgres first';
  END IF;
END $$;

CREATE TABLE hms.patient (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "mrn" TEXT NOT NULL,
    "identity_status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "name_bn" TEXT,
    "name_en" TEXT,
    "sex" TEXT NOT NULL,
    "birth_date" DATE,
    "birth_date_precision" TEXT NOT NULL,
    "birth_year" SMALLINT,
    "reported_age_years" SMALLINT,
    "reported_age_on" DATE,
    "phone_raw" TEXT,
    "phone_normalized" TEXT,
    "address_text" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "patient_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "patient_mrn_check" CHECK (length(btrim("mrn")) > 0),
    CONSTRAINT "patient_identity_status_check" CHECK ("identity_status" IN ('CONFIRMED', 'TEMPORARY')),
    CONSTRAINT "patient_sex_check" CHECK ("sex" IN ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN')),
    -- FR-PAT-009: a name in at least one script, unless the identity is temporary (FR-PAT-004).
    CONSTRAINT "patient_name_check" CHECK (
      ("name_bn" IS NULL OR length(btrim("name_bn")) > 0)
      AND ("name_en" IS NULL OR length(btrim("name_en")) > 0)
      AND ("identity_status" = 'TEMPORARY' OR num_nonnulls("name_bn", "name_en") >= 1)
    ),
    -- FR-PAT-006: an exact date, or a reported age with the day it was reported. Never both, and
    -- the derived birth year must match, so an estimate cannot pass as an exact date.
    CONSTRAINT "patient_birth_check" CHECK (
      (
        "birth_date_precision" = 'EXACT'
        AND "birth_date" IS NOT NULL
        AND "reported_age_years" IS NULL AND "reported_age_on" IS NULL
        AND "birth_year" = EXTRACT(YEAR FROM "birth_date")
      ) OR (
        "birth_date_precision" = 'YEAR_ESTIMATED'
        AND "birth_date" IS NULL
        AND "reported_age_years" BETWEEN 0 AND 150 AND "reported_age_on" IS NOT NULL
        AND "birth_year" = EXTRACT(YEAR FROM "reported_age_on") - "reported_age_years"
      ) OR (
        "birth_date_precision" = 'UNKNOWN'
        AND "identity_status" = 'TEMPORARY'
        AND "birth_date" IS NULL AND "reported_age_years" IS NULL AND "reported_age_on" IS NULL
        AND "birth_year" IS NULL
      )
    ),
    CONSTRAINT "patient_phone_check" CHECK (("phone_raw" IS NULL) = ("phone_normalized" IS NULL))
);

CREATE UNIQUE INDEX "patient_tenant_id_id_key" ON hms.patient ("tenant_id", "id");
-- CP-09 / C-033: the MRN is unique per hospital.
CREATE UNIQUE INDEX "patient_tenant_id_mrn_key" ON hms.patient ("tenant_id", "mrn");
CREATE INDEX "patient_tenant_id_phone_normalized_idx" ON hms.patient ("tenant_id", "phone_normalized");
CREATE INDEX "patient_tenant_id_birth_year_idx" ON hms.patient ("tenant_id", "birth_year");
-- Similar-name candidates (FR-PAT-011) and name search (T-PAT-02). RLS adds the hospital filter.
CREATE INDEX "patient_name_en_trgm_idx" ON hms.patient USING gin ("name_en" hms.gin_trgm_ops);
CREATE INDEX "patient_name_bn_trgm_idx" ON hms.patient USING gin ("name_bn" hms.gin_trgm_ops);

ALTER TABLE hms.patient ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.patient FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.patient
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- Registration only inserts. No DELETE either: a patient record is never removed (SRC-N05).
REVOKE UPDATE ON hms.patient FROM hms_app;
