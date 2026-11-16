-- Consultations (T-CLI-01; FR-CLI-002; UC-CLI-01 step 1; C-009, C-011; E section 3). The doctor
-- starts the consultation of a checked-in OPD visit once its doctor fee is eligible: the row is
-- created IN_CONSULTATION, and signing the note (T-CLI-02) moves it to CONSULTED. One
-- consultation per visit, so two doctors cannot open the same patient (the start also checks the
-- visit's version, SP-03). The worklist's EXPECTED, WAITING_PAYMENT and WAITING are derived from
-- the appointment, the visit and billing, not stored here.

CREATE TABLE hms.consultation (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "practitioner_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_CONSULTATION',
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_by" UUID NOT NULL,
    "completed_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "consultation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "consultation_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Composite keys keep every reference inside the hospital (ADR-003).
    CONSTRAINT "consultation_tenant_id_visit_id_fkey" FOREIGN KEY ("tenant_id", "visit_id")
      REFERENCES hms.visit ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "consultation_tenant_id_practitioner_id_fkey" FOREIGN KEY ("tenant_id", "practitioner_id")
      REFERENCES hms.practitioner ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "consultation_status_check" CHECK ("status" IN ('IN_CONSULTATION', 'CONSULTED')),
    -- The completion time follows the state, so a row never claims a state it skipped.
    CONSTRAINT "consultation_completed_check"
      CHECK (("status" = 'CONSULTED') = ("completed_at" IS NOT NULL)),
    CONSTRAINT "consultation_version_check" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "consultation_tenant_id_id_key" ON hms.consultation ("tenant_id", "id");
-- One consultation per visit.
CREATE UNIQUE INDEX "consultation_tenant_id_visit_id_key" ON hms.consultation ("tenant_id", "visit_id");

ALTER TABLE hms.consultation ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.consultation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.consultation
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- Whose consultation, of which visit, started when and by whom never change; signing changes the
-- state only. No DELETE (not granted by default).
REVOKE UPDATE ON hms.consultation FROM hms_app;
GRANT UPDATE (status, completed_at, updated_at, version) ON hms.consultation TO hms_app;
