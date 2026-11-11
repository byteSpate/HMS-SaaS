-- Visits and check-in (T-VIS-01; FR-VIS-002, FR-VIS-004, FR-SCH-004; UC-VIS-01; C-006, C-007,
-- C-035; E section 5.3). A visit is the patient's attendance: check-in of an appointment creates
-- exactly one, with the serial number in the doctor's queue for the session. The session keeps
-- the last serial number given, so numbers follow check-in order. Invoices and charges, created
-- before this table existed (T-BIL-02), now point at their visit with a foreign key.

ALTER TABLE hms.schedule_session
  ADD COLUMN "last_queue_number" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "schedule_session_last_queue_number_check" CHECK ("last_queue_number" >= 0);
GRANT UPDATE ("last_queue_number") ON hms.schedule_session TO hms_app;

CREATE TABLE hms.visit (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "department_id" UUID,
    "patient_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "attending_practitioner_id" UUID,
    "appointment_id" UUID,
    "schedule_session_id" UUID,
    "queue_number" INTEGER,
    "arrived_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "visit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "visit_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Composite keys keep every reference inside the hospital (ADR-003).
    CONSTRAINT "visit_tenant_id_facility_id_fkey" FOREIGN KEY ("tenant_id", "facility_id")
      REFERENCES hms.facility ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "visit_tenant_id_department_id_fkey" FOREIGN KEY ("tenant_id", "department_id")
      REFERENCES hms.department ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "visit_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id")
      REFERENCES hms.patient ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "visit_tenant_id_attending_practitioner_id_fkey"
      FOREIGN KEY ("tenant_id", "attending_practitioner_id")
      REFERENCES hms.practitioner ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "visit_tenant_id_appointment_id_fkey" FOREIGN KEY ("tenant_id", "appointment_id")
      REFERENCES hms.appointment ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "visit_tenant_id_schedule_session_id_fkey" FOREIGN KEY ("tenant_id", "schedule_session_id")
      REFERENCES hms.schedule_session ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- C-006: emergency visits come with C10; diagnostic visits with T-VIS-02.
    CONSTRAINT "visit_kind_check" CHECK ("kind" IN ('OPD_CONSULTATION', 'DIAGNOSTIC', 'EMERGENCY')),
    CONSTRAINT "visit_status_check" CHECK ("status" IN ('OPEN', 'COMPLETED', 'CANCELLED')),
    -- A consultation is always with a doctor.
    CONSTRAINT "visit_consultation_practitioner_check"
      CHECK ("kind" <> 'OPD_CONSULTATION' OR "attending_practitioner_id" IS NOT NULL),
    -- A serial number belongs to a session's queue.
    CONSTRAINT "visit_queue_number_check"
      CHECK (("queue_number" IS NULL) = ("schedule_session_id" IS NULL) AND ("queue_number" IS NULL OR "queue_number" >= 1)),
    CONSTRAINT "visit_version_check" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "visit_tenant_id_id_key" ON hms.visit ("tenant_id", "id");
-- FR-VIS-002: check-in of an appointment creates exactly one visit.
CREATE UNIQUE INDEX "visit_tenant_id_appointment_id_key" ON hms.visit ("tenant_id", "appointment_id");
-- C-035: one serial number per place in a session's queue.
CREATE UNIQUE INDEX "visit_session_queue_number_key"
  ON hms.visit ("tenant_id", "schedule_session_id", "queue_number");
-- The patient's visits, newest first (follow-up fees, the patient record).
CREATE INDEX "visit_patient_idx" ON hms.visit ("tenant_id", "patient_id", "arrived_at" DESC);
-- The doctor's worklist of open visits (T-CLI-01).
CREATE INDEX "visit_worklist_idx"
  ON hms.visit ("tenant_id", "attending_practitioner_id", "status", "arrived_at") WHERE "status" = 'OPEN';

ALTER TABLE hms.visit ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.visit FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.visit
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- Who, where and with whom never change; completion and cancellation (FR-VIS-003) change the
-- status only.
REVOKE UPDATE ON hms.visit FROM hms_app;
GRANT UPDATE (status, updated_at, version) ON hms.visit TO hms_app;

-- T-BIL-02 created these columns before the visit table; every invoice and charge is of a visit.
ALTER TABLE hms.invoice
  ADD CONSTRAINT "invoice_tenant_id_visit_id_fkey" FOREIGN KEY ("tenant_id", "visit_id")
    REFERENCES hms.visit ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE hms.charge
  ADD CONSTRAINT "charge_tenant_id_visit_id_fkey" FOREIGN KEY ("tenant_id", "visit_id")
    REFERENCES hms.visit ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
