-- Schedule sessions (T-SCH-01; FR-SCH-002; C-035; E section 5.3). One sitting of a practitioner on
-- one hospital date with a fixed capacity and no overbooking (C-035). booked_count is kept by the
-- booking transaction (T-SCH-02); its CHECK is what turns the last-slot race into CAPACITY_FULL
-- (probe P14).

CREATE TABLE hms.schedule_session (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "practitioner_id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    -- The hospital's calendar date; starts_at and ends_at are the exact instants.
    "session_date" DATE NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "capacity" INTEGER NOT NULL,
    "booked_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "schedule_session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "schedule_session_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Composite keys keep the practitioner and facility inside the session's hospital (ADR-003).
    CONSTRAINT "schedule_session_tenant_id_practitioner_id_fkey" FOREIGN KEY ("tenant_id", "practitioner_id")
      REFERENCES hms.practitioner ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "schedule_session_tenant_id_facility_id_fkey" FOREIGN KEY ("tenant_id", "facility_id")
      REFERENCES hms.facility ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "schedule_session_status_check" CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'CANCELLED')),
    CONSTRAINT "schedule_session_times_check" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "schedule_session_capacity_positive" CHECK ("capacity" > 0),
    -- C-035: no overbooking. A booking that would pass capacity fails here (CAPACITY_FULL).
    CONSTRAINT "schedule_session_capacity" CHECK ("booked_count" BETWEEN 0 AND "capacity"),
    CONSTRAINT "schedule_session_version_check" CHECK ("version" >= 1)
);

-- Composite key for the (tenant_id, schedule_session_id) foreign key of appointments (T-SCH-02).
CREATE UNIQUE INDEX "schedule_session_tenant_id_id_key" ON hms.schedule_session ("tenant_id", "id");
-- Reception reads a date range; a doctor's own list reads by practitioner.
CREATE INDEX "schedule_session_tenant_id_session_date_idx"
  ON hms.schedule_session ("tenant_id", "session_date");
CREATE INDEX "schedule_session_tenant_id_practitioner_id_session_date_idx"
  ON hms.schedule_session ("tenant_id", "practitioner_id", "session_date");

ALTER TABLE hms.schedule_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.schedule_session FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.schedule_session
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- The practitioner, facility, times and capacity are fixed once entered: a different sitting is a
-- new session. The app changes the status and the booked count only. No DELETE (not granted by
-- default): a session is cancelled, never removed.
REVOKE UPDATE ON hms.schedule_session FROM hms_app;
GRANT UPDATE (status, booked_count, updated_at, updated_by, version)
  ON hms.schedule_session TO hms_app;
