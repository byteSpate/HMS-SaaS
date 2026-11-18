-- Service catalogue (T-ORD-01; FR-ORD-001, FR-ORD-007, FR-CFG-001, FR-I18N-006; owner choice
-- 2026-11-18: extend billing's catalogue). service_item, created with the doctor-fee items
-- (T-BIL-01), now also holds the tests, imaging and procedures the hospital orders: whether
-- reception may order an item directly without a doctor (CP-01), and the expected reporting time
-- printed on receipts and order slips. Prices stay in the price list versions.

ALTER TABLE hms.service_item
  ADD COLUMN "directly_orderable" BOOLEAN NOT NULL DEFAULT false,
  -- FR-ORD-007: hours from the order to the report; null when the item has no report.
  ADD COLUMN "report_hours" INTEGER,
  ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "service_item_report_hours_check"
    CHECK ("report_hours" IS NULL OR "report_hours" BETWEEN 1 AND 720),
  -- FR-I18N-006: a name in at least one script.
  ADD CONSTRAINT "service_item_name_check" CHECK (num_nonnulls("name_bn", "name_en") >= 1),
  ADD CONSTRAINT "service_item_version_check" CHECK ("version" >= 1);

-- A service's price has no practitioner. NULLs are distinct in the existing unique index, so one
-- price per service and version needs its own index.
CREATE UNIQUE INDEX "price_list_item_service_price_key"
  ON hms.price_list_item ("tenant_id", "price_list_version_id", "service_item_id")
  WHERE "practitioner_id" IS NULL;

-- The app edits names, the orderable flag, the report time and the active flag. The code and the
-- category never change: the category decides the invoice a charge goes on (C-008).
GRANT UPDATE (name_en, name_bn, directly_orderable, report_hours, active, updated_at, version)
  ON hms.service_item TO hms_app;
