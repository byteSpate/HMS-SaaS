-- Appointments (T-SCH-02; FR-SCH-001..005; UC-SCH-01/02; C-035; E section 5.3). A booking holds one
-- place in a schedule session; the booking transaction raises schedule_session.booked_count, whose
-- CHECK keeps the session from being overbooked (probe P14). Rescheduling links the new appointment
-- to the one it replaced. A booking is not attendance: visits come with check-in (T-VIS-01).

CREATE TABLE hms.appointment (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "schedule_session_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "rescheduled_from_id" UUID,
    "cancel_reason" TEXT,
    "booked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "booked_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "appointment_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Composite keys keep the patient, session and earlier appointment inside the hospital (ADR-003).
    CONSTRAINT "appointment_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id")
      REFERENCES hms.patient ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "appointment_tenant_id_schedule_session_id_fkey" FOREIGN KEY ("tenant_id", "schedule_session_id")
      REFERENCES hms.schedule_session ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "appointment_status_check"
      CHECK ("status" IN ('BOOKED', 'CHECKED_IN', 'RESCHEDULED', 'CANCELLED', 'NO_SHOW')),
    -- FR-SCH-002: a cancellation keeps its reason; only a cancellation has one.
    CONSTRAINT "appointment_cancel_reason_check" CHECK (
      ("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL)
      AND ("cancel_reason" IS NULL OR length(btrim("cancel_reason")) > 0)
    ),
    CONSTRAINT "appointment_version_check" CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX "appointment_tenant_id_id_key" ON hms.appointment ("tenant_id", "id");
-- After the index above, which the self-reference needs.
ALTER TABLE hms.appointment
  ADD CONSTRAINT "appointment_tenant_id_rescheduled_from_id_fkey" FOREIGN KEY ("tenant_id", "rescheduled_from_id")
    REFERENCES hms.appointment ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- An appointment is replaced at most once.
CREATE UNIQUE INDEX "appointment_tenant_id_rescheduled_from_id_key"
  ON hms.appointment ("tenant_id", "rescheduled_from_id");
-- One patient holds at most one live booking in a session; a second one is a double entry.
CREATE UNIQUE INDEX "appointment_one_booking_per_patient_session"
  ON hms.appointment ("tenant_id", "schedule_session_id", "patient_id")
  WHERE "status" = 'BOOKED';
-- A session's list at reception, and a patient's appointments on the patient record.
CREATE INDEX "appointment_tenant_id_schedule_session_id_status_idx"
  ON hms.appointment ("tenant_id", "schedule_session_id", "status");
CREATE INDEX "appointment_tenant_id_patient_id_idx" ON hms.appointment ("tenant_id", "patient_id");

ALTER TABLE hms.appointment ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.appointment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.appointment
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- The patient, session, link and booking facts never change: a different booking is a new
-- appointment. The app changes the status (with the reason) only. No DELETE (not granted by
-- default): an appointment is cancelled, never removed.
REVOKE UPDATE ON hms.appointment FROM hms_app;
GRANT UPDATE (status, cancel_reason, updated_at, updated_by, version) ON hms.appointment TO hms_app;
