-- Cashier sessions (T-BIL-03; FR-BIL-026; UC-BIL-04; SRC-B07; E section 5.4). A cashier opens a
-- session (an optional cash float), records payments in it (T-BIL-04), and closes it with the
-- amounts counted per method. The server stores the expected amount, the counted amount and the
-- variance of each method, and a finance user other than the cashier reviews the session.
-- State: OPEN -> CLOSED_PENDING_REVIEW -> REVIEWED.

CREATE TABLE hms.cashier_session (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "opening_float" NUMERIC(18,2) NOT NULL DEFAULT 0,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "review_note" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "cashier_session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cashier_session_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cashier_session_tenant_id_facility_id_fkey" FOREIGN KEY ("tenant_id", "facility_id")
      REFERENCES hms.facility ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cashier_session_status_check"
      CHECK ("status" IN ('OPEN', 'CLOSED_PENDING_REVIEW', 'REVIEWED')),
    CONSTRAINT "cashier_session_opening_float_check" CHECK ("opening_float" >= 0),
    -- The times and the reviewer follow the state, so a row can never claim a state it skipped.
    CONSTRAINT "cashier_session_closed_check" CHECK (("status" = 'OPEN') = ("closed_at" IS NULL)),
    CONSTRAINT "cashier_session_reviewed_check" CHECK (
      ("status" = 'REVIEWED') = ("reviewed_by" IS NOT NULL)
      AND ("reviewed_by" IS NULL) = ("reviewed_at" IS NULL)
    ),
    -- UC-BIL-04 D2: a cashier never reviews their own variance (segregation of duty).
    CONSTRAINT "cashier_session_reviewer_check" CHECK ("reviewed_by" IS DISTINCT FROM "cashier_id"),
    CONSTRAINT "cashier_session_version_check" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "cashier_session_tenant_id_id_key" ON hms.cashier_session ("tenant_id", "id");
-- UC-BIL-04 D1: one open session per cashier per facility.
CREATE UNIQUE INDEX "cashier_session_one_open_key"
  ON hms.cashier_session ("tenant_id", "facility_id", "cashier_id") WHERE "status" = 'OPEN';
-- The cashier's own sessions, newest first.
CREATE INDEX "cashier_session_cashier_idx"
  ON hms.cashier_session ("tenant_id", "cashier_id", "opened_at" DESC);
-- The finance review queue.
CREATE INDEX "cashier_session_review_idx"
  ON hms.cashier_session ("tenant_id", "status", "closed_at") WHERE "status" = 'CLOSED_PENDING_REVIEW';

-- One row per payment method at closing: what the payments say, what was counted, the difference.
CREATE TABLE hms.cashier_session_count (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "expected" NUMERIC(18,2) NOT NULL,
    "counted" NUMERIC(18,2) NOT NULL,
    "variance" NUMERIC(18,2) NOT NULL,

    CONSTRAINT "cashier_session_count_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cashier_session_count_tenant_id_fkey" FOREIGN KEY ("tenant_id")
      REFERENCES hms.tenant ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cashier_session_count_tenant_id_session_id_fkey" FOREIGN KEY ("tenant_id", "session_id")
      REFERENCES hms.cashier_session ("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- FR-BIL-004, C-010: the actual methods.
    CONSTRAINT "cashier_session_count_method_check"
      CHECK ("method" IN ('CASH', 'CARD', 'MOBILE', 'BANK_TRANSFER')),
    CONSTRAINT "cashier_session_count_amounts_check" CHECK ("expected" >= 0 AND "counted" >= 0),
    CONSTRAINT "cashier_session_count_variance_check" CHECK ("variance" = "counted" - "expected")
);
CREATE UNIQUE INDEX "cashier_session_count_tenant_id_id_key"
  ON hms.cashier_session_count ("tenant_id", "id");
CREATE UNIQUE INDEX "cashier_session_count_session_method_key"
  ON hms.cashier_session_count ("tenant_id", "session_id", "method");

ALTER TABLE hms.cashier_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.cashier_session FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.cashier_session
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

ALTER TABLE hms.cashier_session_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.cashier_session_count FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.cashier_session_count
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- Who, where, when opened and the float never change; closing and review change the state only.
-- The counts are written once at closing (FPR-06: nothing posted is edited).
REVOKE UPDATE ON hms.cashier_session FROM hms_app;
GRANT UPDATE (status, closed_at, reviewed_by, reviewed_at, review_note, updated_at, version)
  ON hms.cashier_session TO hms_app;
REVOKE UPDATE ON hms.cashier_session_count FROM hms_app;
