-- Idempotency records (T-PLT-01; FPR-08; E section 8; D section 9.3). Written in the same
-- transaction as the command they protect. Records expire after 7 days (PROPOSED in D section 9.3).
CREATE TABLE hms.idempotency_record (
    "tenant_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "idem_key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "request_hash" BYTEA NOT NULL,
    "status" TEXT NOT NULL,
    "response" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("tenant_id", "actor_user_id", "idem_key"),
    CONSTRAINT "idempotency_record_status_check" CHECK ("status" IN ('IN_PROGRESS', 'COMPLETED'))
);

CREATE INDEX "idempotency_record_expires_at_idx" ON hms.idempotency_record ("expires_at");

ALTER TABLE hms.idempotency_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.idempotency_record FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.idempotency_record
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON hms.idempotency_record TO hms_app;
