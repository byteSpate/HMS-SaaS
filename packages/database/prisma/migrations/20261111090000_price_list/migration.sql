-- Price lists with doctor fees (T-BIL-01; FR-CFG-001, FR-CFG-002, FR-BIL-007; C-041; E section 5.4).
-- A price list version is edited as a DRAFT and then PUBLISHED with an effective time; the version
-- in force at a moment is the published one with the latest effective time not after it. Records
-- keep the version they used, so a later publication never changes them (AT-CFG-002). Only the
-- doctor-fee system items exist for now; the service catalogue comes with orders (T-ORD-01).

CREATE TABLE hms.service_item (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_en" TEXT,
    "name_bn" TEXT,
    "category" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_item_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "service_item_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "service_item_category_check"
      CHECK ("category" IN ('CONSULTATION', 'LAB', 'IMAGING', 'PROCEDURE', 'MEDICINE', 'BED', 'OTHER')),
    CONSTRAINT "service_item_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_-]{0,39}$')
);
CREATE UNIQUE INDEX "service_item_tenant_id_id_key" ON hms.service_item ("tenant_id", "id");
CREATE UNIQUE INDEX "service_item_tenant_id_code_key" ON hms.service_item ("tenant_id", "code");

CREATE TABLE hms.price_list_version (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMPTZ,
    "published_at" TIMESTAMPTZ,
    "published_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "price_list_version_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "price_list_version_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "price_list_version_status_check" CHECK ("status" IN ('DRAFT', 'PUBLISHED')),
    -- A published version has its effective time and who published it; a draft has neither.
    CONSTRAINT "price_list_version_published_check" CHECK (
      ("status" = 'PUBLISHED') = ("effective_from" IS NOT NULL)
      AND ("status" = 'PUBLISHED') = ("published_at" IS NOT NULL)
      AND ("status" = 'PUBLISHED') = ("published_by" IS NOT NULL)
    ),
    CONSTRAINT "price_list_version_version_no_check" CHECK ("version_no" >= 1),
    CONSTRAINT "price_list_version_version_check" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "price_list_version_tenant_id_id_key" ON hms.price_list_version ("tenant_id", "id");
CREATE UNIQUE INDEX "price_list_version_tenant_id_version_no_key"
  ON hms.price_list_version ("tenant_id", "version_no");
-- One draft at a time, so two administrators never edit competing drafts.
CREATE UNIQUE INDEX "price_list_version_one_draft"
  ON hms.price_list_version ("tenant_id") WHERE "status" = 'DRAFT';
-- Two versions taking effect at the same instant would make "the version in force" ambiguous.
CREATE UNIQUE INDEX "price_list_version_one_per_effective_time"
  ON hms.price_list_version ("tenant_id", "effective_from") WHERE "status" = 'PUBLISHED';

CREATE TABLE hms.price_list_item (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "price_list_version_id" UUID NOT NULL,
    "service_item_id" UUID NOT NULL,
    "practitioner_id" UUID,
    "unit_price" NUMERIC(18,2) NOT NULL,
    "follow_up_days" INTEGER,

    CONSTRAINT "price_list_item_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "price_list_item_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Composite keys keep the version, item and practitioner inside the hospital (ADR-003).
    CONSTRAINT "price_list_item_tenant_id_price_list_version_id_fkey"
      FOREIGN KEY ("tenant_id", "price_list_version_id")
      REFERENCES hms.price_list_version ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "price_list_item_tenant_id_service_item_id_fkey" FOREIGN KEY ("tenant_id", "service_item_id")
      REFERENCES hms.service_item ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "price_list_item_tenant_id_practitioner_id_fkey" FOREIGN KEY ("tenant_id", "practitioner_id")
      REFERENCES hms.practitioner ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "price_list_item_unit_price_check" CHECK ("unit_price" >= 0),
    CONSTRAINT "price_list_item_follow_up_days_check"
      CHECK ("follow_up_days" IS NULL OR "follow_up_days" BETWEEN 1 AND 365)
);
CREATE UNIQUE INDEX "price_list_item_tenant_id_id_key" ON hms.price_list_item ("tenant_id", "id");
-- One price per item (and practitioner, for doctor fees) in a version.
CREATE UNIQUE INDEX "price_list_item_one_price"
  ON hms.price_list_item ("tenant_id", "price_list_version_id", "service_item_id", "practitioner_id")
  NULLS NOT DISTINCT;
CREATE INDEX "price_list_item_tenant_id_price_list_version_id_idx"
  ON hms.price_list_item ("tenant_id", "price_list_version_id");

-- AT-CFG-002: a published version's prices never change, whatever the app does. Items are added,
-- changed and removed only while their version is a draft.
CREATE FUNCTION hms.price_list_item_draft_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  target_version uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.price_list_version_id
                              ELSE NEW.price_list_version_id END;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.price_list_version_id <> OLD.price_list_version_id THEN
    RAISE EXCEPTION 'A price cannot move to another price list version';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM hms.price_list_version
    WHERE id = target_version AND status = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'Prices of a published price list version cannot change'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER "price_list_item_draft_only"
  BEFORE INSERT OR UPDATE OR DELETE ON hms.price_list_item
  FOR EACH ROW EXECUTE FUNCTION hms.price_list_item_draft_only();

ALTER TABLE hms.service_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.service_item FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.service_item
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

ALTER TABLE hms.price_list_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.price_list_version FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.price_list_version
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

ALTER TABLE hms.price_list_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.price_list_item FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.price_list_item
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- Service items are created by the app and never edited yet (names and codes are fixed for the
-- system items). A version changes only its status, publication facts and version. An item of a
-- draft changes its price and window, or is removed from the draft (the trigger guards both).
REVOKE UPDATE ON hms.service_item FROM hms_app;
REVOKE UPDATE ON hms.price_list_version FROM hms_app;
GRANT UPDATE (status, effective_from, published_at, published_by, updated_at, updated_by, version)
  ON hms.price_list_version TO hms_app;
REVOKE UPDATE ON hms.price_list_item FROM hms_app;
GRANT UPDATE (unit_price, follow_up_days) ON hms.price_list_item TO hms_app;
GRANT DELETE ON hms.price_list_item TO hms_app;
