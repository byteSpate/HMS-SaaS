-- Service orders (T-ORD-01; FR-ORD-002, FR-ORD-003, FR-ORD-004, FR-ORD-005, FR-ORD-007; C-008,
-- C-011; UC-CLI-01 step 3; owner choice 2026-11-18). An order asks for one catalogue service for
-- a visit: from the doctor's consultation or directly at reception (T-VIS-02). Creating it
-- requests a charge from billing in the same transaction (postCharge), so the visit's SERVICE
-- invoice gains a line; the order keeps the charge and line IDs but never writes invoice tables.
-- Fulfilment (REQUESTED -> IN_PROGRESS -> COMPLETED, or CANCELLED) is separate from payment,
-- which is read from billing (FR-ORD-004). The service's code, names and report hours are kept as
-- they were when ordered, with the catalogue version (FR-ORD-002).

CREATE TABLE hms.service_order (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    -- Set for clinician orders (source CONSULTATION).
    "consultation_id" UUID,
    "source" TEXT NOT NULL,
    -- FR-ORD-002: the authenticated user, from the session, never from the client.
    "requested_by" UUID NOT NULL,
    -- The doctor for clinician orders.
    "requesting_practitioner_id" UUID,
    "service_item_id" UUID NOT NULL,
    "service_item_version" INTEGER NOT NULL,
    "service_code" TEXT NOT NULL,
    "service_name_en" TEXT,
    "service_name_bn" TEXT,
    "category" TEXT NOT NULL,
    "report_hours" INTEGER,
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "clinical_note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "charge_id" UUID NOT NULL,
    "invoice_line_id" UUID NOT NULL,
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "service_order_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "service_order_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "service_order_tenant_id_visit_id_fkey" FOREIGN KEY ("tenant_id", "visit_id")
      REFERENCES hms.visit ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "service_order_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id")
      REFERENCES hms.patient ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "service_order_tenant_id_consultation_id_fkey" FOREIGN KEY ("tenant_id", "consultation_id")
      REFERENCES hms.consultation ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "service_order_tenant_id_requesting_practitioner_id_fkey" FOREIGN KEY ("tenant_id", "requesting_practitioner_id")
      REFERENCES hms.practitioner ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "service_order_tenant_id_service_item_id_fkey" FOREIGN KEY ("tenant_id", "service_item_id")
      REFERENCES hms.service_item ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "service_order_tenant_id_charge_id_fkey" FOREIGN KEY ("tenant_id", "charge_id")
      REFERENCES hms.charge ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "service_order_tenant_id_invoice_line_id_fkey" FOREIGN KEY ("tenant_id", "invoice_line_id")
      REFERENCES hms.invoice_line ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- WARD and EMERGENCY come with the IPD and emergency epics.
    CONSTRAINT "service_order_source_check" CHECK ("source" IN ('CONSULTATION', 'RECEPTION_DIRECT')),
    -- A clinician order names its consultation and doctor; a direct order has neither.
    CONSTRAINT "service_order_source_links_check" CHECK (
      ("source" = 'CONSULTATION') = ("consultation_id" IS NOT NULL AND "requesting_practitioner_id" IS NOT NULL)
    ),
    CONSTRAINT "service_order_priority_check" CHECK ("priority" IN ('ROUTINE', 'URGENT')),
    CONSTRAINT "service_order_status_check" CHECK ("status" IN ('REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    -- UC-ORD-02: a cancellation records its reason, time and user.
    CONSTRAINT "service_order_cancel_check" CHECK (
      ("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL)
    ),
    CONSTRAINT "service_order_note_check" CHECK ("clinical_note" IS NULL OR length("clinical_note") <= 500),
    CONSTRAINT "service_order_version_check" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "service_order_tenant_id_id_key" ON hms.service_order ("tenant_id", "id");
-- One order per charge.
CREATE UNIQUE INDEX "service_order_tenant_id_charge_id_key" ON hms.service_order ("tenant_id", "charge_id");
CREATE INDEX "service_order_visit_idx" ON hms.service_order ("tenant_id", "visit_id");
CREATE INDEX "service_order_patient_idx" ON hms.service_order ("tenant_id", "patient_id", "created_at");

ALTER TABLE hms.service_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.service_order FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.service_order
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- What was ordered, for whom and by whom never changes; only the fulfilment state does. No DELETE.
REVOKE UPDATE ON hms.service_order FROM hms_app;
GRANT UPDATE (status, cancel_reason, cancelled_at, cancelled_by, updated_at, version)
  ON hms.service_order TO hms_app;
