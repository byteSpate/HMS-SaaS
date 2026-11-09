-- Practitioner master (T-PRA-01; FR-PRA-001..003; E section 5.1). A professional identity, not an
-- employee record. Two practitioners may share a name, so nothing here is unique except the id.
-- The department and the user-account link come later (owner decision 2026-11-08, option A).

CREATE TABLE hms.practitioner (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name_bn" TEXT,
    "name_en" TEXT,
    "degrees" TEXT,
    "specialty" TEXT,
    "phone" TEXT,
    "registration_no" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "practitioner_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "practitioner_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- FR-PRA-001: a name in at least one script; no field is stored as blank text.
    CONSTRAINT "practitioner_name_check" CHECK (num_nonnulls("name_bn", "name_en") >= 1),
    CONSTRAINT "practitioner_text_check" CHECK (
      ("name_bn" IS NULL OR length(btrim("name_bn")) > 0)
      AND ("name_en" IS NULL OR length(btrim("name_en")) > 0)
      AND ("degrees" IS NULL OR length(btrim("degrees")) > 0)
      AND ("specialty" IS NULL OR length(btrim("specialty")) > 0)
      AND ("phone" IS NULL OR length(btrim("phone")) > 0)
      AND ("registration_no" IS NULL OR length(btrim("registration_no")) > 0)
    ),
    CONSTRAINT "practitioner_version_check" CHECK ("version" >= 1)
);

-- Composite key for the (tenant_id, practitioner_id) foreign keys of schedules, visits and fees.
CREATE UNIQUE INDEX "practitioner_tenant_id_id_key" ON hms.practitioner ("tenant_id", "id");

ALTER TABLE hms.practitioner ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.practitioner FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.practitioner
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- The app may change the editable columns only; who created the record, and when, never change.
-- No DELETE (not granted by default): a practitioner is deactivated, never removed.
REVOKE UPDATE ON hms.practitioner FROM hms_app;
GRANT UPDATE (name_bn, name_en, degrees, specialty, phone, registration_no, active,
              updated_at, updated_by, version)
  ON hms.practitioner TO hms_app;
