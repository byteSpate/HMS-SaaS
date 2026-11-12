-- Payments, allocations and receipt prints (T-BIL-04; FR-BIL-002, FR-BIL-004, FR-BIL-011,
-- FR-BIL-012, FR-BIL-019, FR-BIL-027, FR-BIL-034; C-009, C-010, C-038, C-039, C-040; P-020,
-- ADR-016, ADR-009; E section 5.4, 9.1). A payment is money a cashier received in an open
-- session. It is allocated to invoice lines, possibly of several open invoices of one patient
-- (C-039), never more than a line's remaining amount (C-038). A line is ELIGIBLE when fully paid
-- (C-040 FULL_PAYMENT). Payments, allocations and prints are never changed (FPR-06).

ALTER TABLE hms.invoice_line
  ADD COLUMN "allocated_amount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "eligibility" TEXT NOT NULL DEFAULT 'NOT_ELIGIBLE',
  -- Probe P11, race C2: whatever path writes, a line is never paid more than its amount.
  ADD CONSTRAINT "invoice_line_allocation_within_net"
    CHECK ("allocated_amount" >= 0 AND "allocated_amount" <= "net_amount"),
  ADD CONSTRAINT "invoice_line_eligibility_check"
    CHECK ("eligibility" IN ('ELIGIBLE', 'NOT_ELIGIBLE'));
GRANT UPDATE ("allocated_amount", "eligibility") ON hms.invoice_line TO hms_app;

CREATE TABLE hms.payment (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "patient_id" UUID NOT NULL,
    "cashier_session_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "provider_label" TEXT,
    "external_reference" TEXT,
    "amount" NUMERIC(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by" UUID NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payment_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id")
      REFERENCES hms.patient ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payment_tenant_id_cashier_session_id_fkey" FOREIGN KEY ("tenant_id", "cashier_session_id")
      REFERENCES hms.cashier_session ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- FR-BIL-004, C-010: the actual method; gateway states come with Q-045.
    CONSTRAINT "payment_method_check" CHECK ("method" IN ('CASH', 'CARD', 'MOBILE', 'BANK_TRANSFER')),
    CONSTRAINT "payment_status_check" CHECK ("status" IN ('RECORDED')),
    CONSTRAINT "payment_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "payment_provider_label_check" CHECK (char_length("provider_label") <= 60),
    CONSTRAINT "payment_external_reference_check" CHECK (char_length("external_reference") <= 100)
);
CREATE UNIQUE INDEX "payment_tenant_id_id_key" ON hms.payment ("tenant_id", "id");
CREATE UNIQUE INDEX "payment_tenant_id_receipt_number_key" ON hms.payment ("tenant_id", "receipt_number");
-- The collection report by day (T-REP-01) and a session's totals at closing (T-BIL-03).
CREATE INDEX "payment_day_idx" ON hms.payment ("tenant_id", "received_at");
CREATE INDEX "payment_session_idx" ON hms.payment ("tenant_id", "cashier_session_id");
CREATE INDEX "payment_patient_idx" ON hms.payment ("tenant_id", "patient_id");

CREATE TABLE hms.payment_allocation (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "invoice_line_id" UUID NOT NULL,
    "amount" NUMERIC(18,2) NOT NULL,
    -- FR-BIL-027: the invoice's balance right after this payment, the same on every allocation of
    -- one payment to one invoice. Kept so a reprint shows what the original receipt showed.
    "invoice_balance_after" NUMERIC(18,2) NOT NULL,

    CONSTRAINT "payment_allocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_allocation_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payment_allocation_tenant_id_payment_id_fkey" FOREIGN KEY ("tenant_id", "payment_id")
      REFERENCES hms.payment ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payment_allocation_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id")
      REFERENCES hms.invoice ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payment_allocation_tenant_id_invoice_line_id_fkey" FOREIGN KEY ("tenant_id", "invoice_line_id")
      REFERENCES hms.invoice_line ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payment_allocation_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "payment_allocation_balance_check" CHECK ("invoice_balance_after" >= 0)
);
CREATE UNIQUE INDEX "payment_allocation_tenant_id_id_key" ON hms.payment_allocation ("tenant_id", "id");
-- A payment pays a line at most once.
CREATE UNIQUE INDEX "payment_allocation_payment_line_key"
  ON hms.payment_allocation ("tenant_id", "payment_id", "invoice_line_id");
CREATE INDEX "payment_allocation_line_idx" ON hms.payment_allocation ("tenant_id", "invoice_line_id");
CREATE INDEX "payment_allocation_invoice_idx" ON hms.payment_allocation ("tenant_id", "invoice_id");

-- FR-BIL-027: each print of a receipt, numbered per payment; copy 2 and later are reprints.
CREATE TABLE hms.receipt_print (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "copy_no" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "printed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printed_by" UUID NOT NULL,

    CONSTRAINT "receipt_print_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "receipt_print_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "receipt_print_tenant_id_payment_id_fkey" FOREIGN KEY ("tenant_id", "payment_id")
      REFERENCES hms.payment ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "receipt_print_copy_no_check" CHECK ("copy_no" >= 1),
    CONSTRAINT "receipt_print_language_check" CHECK ("language" IN ('en', 'bn-BD', 'bilingual'))
);
CREATE UNIQUE INDEX "receipt_print_tenant_id_id_key" ON hms.receipt_print ("tenant_id", "id");
CREATE UNIQUE INDEX "receipt_print_payment_copy_key"
  ON hms.receipt_print ("tenant_id", "payment_id", "copy_no");

ALTER TABLE hms.payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.payment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.payment
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

ALTER TABLE hms.payment_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.payment_allocation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.payment_allocation
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

ALTER TABLE hms.receipt_print ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.receipt_print FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.receipt_print
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- ADR-009, FPR-06: money received is never edited; a correction is a new record (T-BIL-06).
REVOKE UPDATE ON hms.payment FROM hms_app;
REVOKE UPDATE ON hms.payment_allocation FROM hms_app;
REVOKE UPDATE ON hms.receipt_print FROM hms_app;
