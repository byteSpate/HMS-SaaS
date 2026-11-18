-- Medicine catalogue and prescribing lists (T-CLI-03; FR-CLI-004, FR-PHA-011 subset; Q-067 interim:
-- catalogue-based prescription lines, vocabularies entered by the hospital; FR-I18N-006).
-- mod-pharmacy owns both tables (E section 2). medicine is the prescribing catalogue only: stock
-- items, batches, packs and suppliers come with the pharmacy and inventory epics (Phase 4) and
-- extend these rows instead of replacing them. prescribing_term holds the hospital's bilingual
-- lists of routes, frequencies and durations that the doctor picks from. Rows are deactivated,
-- never deleted, because signed prescriptions point at them.

CREATE TABLE hms.medicine (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    -- The trade name printed on the prescription, e.g. "Napa".
    "brand_name" TEXT NOT NULL,
    -- The active ingredient, e.g. "Paracetamol".
    "generic_name" TEXT NOT NULL,
    -- e.g. "500 mg" or "120 mg/5 ml"; free text until Q-067 settles the structure.
    "strength" TEXT,
    -- e.g. "Tablet", "Syrup".
    "form" TEXT NOT NULL,
    -- The brand in Bangla script, when the hospital prints it so.
    "name_bn" TEXT,
    "manufacturer" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "medicine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "medicine_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "medicine_text_check" CHECK (
      length(btrim("brand_name")) BETWEEN 1 AND 120
      AND length(btrim("generic_name")) BETWEEN 1 AND 120
      AND length(btrim("form")) BETWEEN 1 AND 60
      AND ("strength" IS NULL OR length(btrim("strength")) BETWEEN 1 AND 60)
      AND ("name_bn" IS NULL OR length(btrim("name_bn")) BETWEEN 1 AND 120)
      AND ("manufacturer" IS NULL OR length(btrim("manufacturer")) BETWEEN 1 AND 120)
    ),
    CONSTRAINT "medicine_version_check" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "medicine_tenant_id_id_key" ON hms.medicine ("tenant_id", "id");
-- One entry per brand, strength and form in a hospital, whatever the letter case. The service
-- checks first so the administrator gets a field error; this is the last guard.
CREATE UNIQUE INDEX "medicine_identity_key" ON hms.medicine (
  "tenant_id", lower("brand_name"), lower(coalesce("strength", '')), lower("form")
);
-- The doctor's picker searches active medicines by brand or generic name.
CREATE INDEX "medicine_brand_name_idx" ON hms.medicine ("tenant_id", lower("brand_name"));
CREATE INDEX "medicine_generic_name_idx" ON hms.medicine ("tenant_id", lower("generic_name"));

CREATE TABLE hms.prescribing_term (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "label_bn" TEXT,
    "label_en" TEXT,
    -- Lower first in the doctor's picker; ties by English label.
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "prescribing_term_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "prescribing_term_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "prescribing_term_kind_check" CHECK ("kind" IN ('ROUTE', 'FREQUENCY', 'DURATION')),
    -- FR-I18N-006: a label in at least one script.
    CONSTRAINT "prescribing_term_label_check" CHECK (num_nonnulls("label_bn", "label_en") >= 1),
    CONSTRAINT "prescribing_term_text_check" CHECK (
      ("label_bn" IS NULL OR length(btrim("label_bn")) BETWEEN 1 AND 80)
      AND ("label_en" IS NULL OR length(btrim("label_en")) BETWEEN 1 AND 80)
    ),
    CONSTRAINT "prescribing_term_sort_order_check" CHECK ("sort_order" BETWEEN 0 AND 9999),
    CONSTRAINT "prescribing_term_version_check" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "prescribing_term_tenant_id_id_key" ON hms.prescribing_term ("tenant_id", "id");
CREATE INDEX "prescribing_term_kind_idx" ON hms.prescribing_term ("tenant_id", "kind", "sort_order");

ALTER TABLE hms.medicine ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.medicine FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.medicine
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());
ALTER TABLE hms.prescribing_term ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.prescribing_term FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.prescribing_term
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- The app edits the catalogue text and the active flag; who created a row never changes. No
-- DELETE (not granted by default): an entry is deactivated.
REVOKE UPDATE ON hms.medicine FROM hms_app;
GRANT UPDATE (brand_name, generic_name, strength, form, name_bn, manufacturer, active,
              updated_at, updated_by, version)
  ON hms.medicine TO hms_app;
-- The kind of a term never changes: a route never becomes a frequency.
REVOKE UPDATE ON hms.prescribing_term FROM hms_app;
GRANT UPDATE (label_bn, label_en, sort_order, active, updated_at, updated_by, version)
  ON hms.prescribing_term TO hms_app;
