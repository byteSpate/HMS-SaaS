-- Department master (T-PRA-02; FR-CFG-001, FR-I18N-006; E section 4). The table has existed since
-- the tenancy migration with its code, names and facility; this makes it an editable master: an
-- active flag, who changed it and when, and a version for SP-03. No app wrote departments before,
-- so the new NOT NULL columns meet no rows.

ALTER TABLE hms.department
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID NOT NULL,
  ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_by" UUID NOT NULL,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  -- A short code for lists and prints, e.g. MED or OBG: upper case, digits and hyphens.
  ADD CONSTRAINT "department_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9-]{0,19}$'),
  -- FR-I18N-006: a name in at least one script; a missing one falls back to the other.
  ADD CONSTRAINT "department_name_check" CHECK (num_nonnulls("name_bn", "name_en") >= 1),
  ADD CONSTRAINT "department_text_check" CHECK (
    ("name_bn" IS NULL OR length(btrim("name_bn")) > 0)
    AND ("name_en" IS NULL OR length(btrim("name_en")) > 0)
  ),
  ADD CONSTRAINT "department_version_check" CHECK ("version" >= 1);

-- The app may change the code, names and active flag only; the facility and who created the
-- department never change. No DELETE (not granted by default): a department is deactivated.
REVOKE UPDATE ON hms.department FROM hms_app;
GRANT UPDATE (code, name_bn, name_en, active, updated_at, updated_by, version)
  ON hms.department TO hms_app;
