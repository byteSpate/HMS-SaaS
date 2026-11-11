-- Charges and invoices (T-BIL-02; FR-BIL-001, FR-BIL-006, FR-BIL-007, FR-BIL-008, FR-BIL-031,
-- FR-BIL-033; C-008; FPR-09; ADR-007, ADR-009; E section 5.4). A charge is one priced posting from
-- another module, unique by its source reference and never changed. Each charge is one line of an
-- invoice: the doctor's fee on the visit's DOCTOR_FEE invoice, services on its SERVICE invoice.
-- Invoice totals are kept in the same transaction as their lines. visit_id gets its foreign key
-- with the visit table (T-VIS-01). Payments and allocations come with T-BIL-04.

CREATE TABLE hms.invoice (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "patient_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "total" NUMERIC(18,2) NOT NULL DEFAULT 0,
    "paid" NUMERIC(18,2) NOT NULL DEFAULT 0,
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoice_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id")
      REFERENCES hms.patient ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- IPD running and pharmacy invoices are later types (E section 5.4); added when they exist.
    CONSTRAINT "invoice_type_check" CHECK ("type" IN ('DOCTOR_FEE', 'SERVICE')),
    CONSTRAINT "invoice_status_check"
      CHECK ("status" IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
    CONSTRAINT "invoice_amounts_check" CHECK ("total" >= 0 AND "paid" >= 0 AND "paid" <= "total"),
    CONSTRAINT "invoice_version_check" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "invoice_tenant_id_id_key" ON hms.invoice ("tenant_id", "id");
CREATE UNIQUE INDEX "invoice_tenant_id_number_key" ON hms.invoice ("tenant_id", "number");
-- C-008: one DOCTOR_FEE and one combined SERVICE invoice per OPD visit.
CREATE UNIQUE INDEX "invoice_one_docfee_per_visit"
  ON hms.invoice ("tenant_id", "visit_id") WHERE "type" = 'DOCTOR_FEE';
CREATE UNIQUE INDEX "invoice_one_service_per_visit"
  ON hms.invoice ("tenant_id", "visit_id") WHERE "type" = 'SERVICE';
CREATE INDEX "invoice_tenant_id_patient_id_idx" ON hms.invoice ("tenant_id", "patient_id");

CREATE TABLE hms.charge (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "service_item_id" UUID NOT NULL,
    "practitioner_id" UUID,
    "source_module" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_event" TEXT NOT NULL,
    "quantity" NUMERIC(14,3) NOT NULL,
    "unit_price" NUMERIC(18,2) NOT NULL,
    "amount" NUMERIC(18,2) NOT NULL,
    "price_list_version_id" UUID NOT NULL,
    "service_time" TIMESTAMPTZ NOT NULL,
    "posted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_by" UUID NOT NULL,

    CONSTRAINT "charge_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "charge_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "charge_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id")
      REFERENCES hms.patient ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "charge_tenant_id_service_item_id_fkey" FOREIGN KEY ("tenant_id", "service_item_id")
      REFERENCES hms.service_item ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "charge_tenant_id_practitioner_id_fkey" FOREIGN KEY ("tenant_id", "practitioner_id")
      REFERENCES hms.practitioner ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- FR-SAA-005, AT-CFG-002: the version that priced the charge, kept for good.
    CONSTRAINT "charge_tenant_id_price_list_version_id_fkey"
      FOREIGN KEY ("tenant_id", "price_list_version_id")
      REFERENCES hms.price_list_version ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "charge_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "charge_amounts_check" CHECK ("unit_price" >= 0 AND "amount" >= 0)
);
CREATE UNIQUE INDEX "charge_tenant_id_id_key" ON hms.charge ("tenant_id", "id");
-- FPR-09, FR-BIL-006: one charge per source posting reference.
CREATE UNIQUE INDEX "charge_source_reference_key"
  ON hms.charge ("tenant_id", "source_module", "source_type", "source_id", "source_event");

CREATE TABLE hms.invoice_line (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "net_amount" NUMERIC(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "invoice_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_line_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoice_line_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id")
      REFERENCES hms.invoice ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoice_line_tenant_id_charge_id_fkey" FOREIGN KEY ("tenant_id", "charge_id")
      REFERENCES hms.charge ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- SRC-B03: medicine and other lines are subtotalled independently (AT-BIL-021).
    CONSTRAINT "invoice_line_category_check" CHECK ("category" IN ('MEDICINE', 'NON_MEDICINE')),
    CONSTRAINT "invoice_line_status_check" CHECK ("status" IN ('ACTIVE', 'CANCELLED', 'REVERSED')),
    CONSTRAINT "invoice_line_net_amount_check" CHECK ("net_amount" >= 0),
    CONSTRAINT "invoice_line_version_check" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "invoice_line_tenant_id_id_key" ON hms.invoice_line ("tenant_id", "id");
-- A charge maps to exactly one line (E section 3.2).
CREATE UNIQUE INDEX "invoice_line_tenant_id_charge_id_key" ON hms.invoice_line ("tenant_id", "charge_id");
CREATE UNIQUE INDEX "invoice_line_tenant_id_invoice_id_line_no_key"
  ON hms.invoice_line ("tenant_id", "invoice_id", "line_no");

ALTER TABLE hms.invoice ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.invoice FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.invoice
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

ALTER TABLE hms.charge ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.charge FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.charge
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

ALTER TABLE hms.invoice_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.invoice_line FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.invoice_line
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- ADR-009: a charge is append-only; a correction is a new charge or an adjustment, never an edit.
-- An invoice changes only its projections (total, paid), status and version; a line only its
-- status and version (cancellation and reversal come with later tasks).
REVOKE UPDATE ON hms.charge FROM hms_app;
REVOKE UPDATE ON hms.invoice FROM hms_app;
GRANT UPDATE (status, total, paid, updated_at, version) ON hms.invoice TO hms_app;
REVOKE UPDATE ON hms.invoice_line FROM hms_app;
GRANT UPDATE (status, updated_at, version) ON hms.invoice_line TO hms_app;
