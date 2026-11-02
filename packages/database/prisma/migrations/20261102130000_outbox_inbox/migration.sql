-- Outbox and inbox (T-PLT-03; ADR-006; E section 8; D section 9.4), and cleanup functions.
CREATE TABLE hms.outbox_event (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "outbox_event_pending_idx" ON hms.outbox_event ("occurred_at") WHERE "published_at" IS NULL;

CREATE TABLE hms.inbox_event (
    "tenant_id" UUID NOT NULL,
    "consumer" TEXT NOT NULL,
    "event_id" UUID NOT NULL,
    "processed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_event_pkey" PRIMARY KEY ("consumer", "event_id")
);

ALTER TABLE hms.outbox_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.outbox_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.outbox_event
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

ALTER TABLE hms.inbox_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE hms.inbox_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hms.inbox_event
  USING (tenant_id = hms.current_tenant_id())
  WITH CHECK (tenant_id = hms.current_tenant_id());

-- The app only adds events; only the relay marks them.
REVOKE UPDATE ON hms.outbox_event FROM hms_app;
REVOKE UPDATE ON hms.inbox_event FROM hms_app;

-- hms_relay needs BYPASSRLS, which only an administrator can create (docker/postgres/*). Where it
-- does not exist yet this migration still applies, and the worker runs without the relay until
-- docker/postgres/supabase/20-relay-role.sql has been run.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'hms_relay') THEN
    GRANT USAGE ON SCHEMA hms TO hms_relay;
    GRANT SELECT ON hms.outbox_event TO hms_relay;
    GRANT UPDATE (published_at, attempts) ON hms.outbox_event TO hms_relay;
  END IF;
END $$;

-- Cleanup across hospitals. As in membership_guard_read, the policies below apply to the owner
-- role only. hms_app can call the functions, which delete expired rows and return only a count.
CREATE POLICY cleanup_expired ON hms.idempotency_record TO hms_migrator USING (expires_at < now());
CREATE POLICY cleanup_old_published ON hms.outbox_event TO hms_migrator
  USING (published_at < now() - INTERVAL '30 days');

CREATE FUNCTION hms.purge_expired_idempotency_records() RETURNS bigint
  LANGUAGE sql SECURITY DEFINER SET search_path = hms, pg_temp AS
$$ WITH removed AS (DELETE FROM hms.idempotency_record WHERE expires_at < now() RETURNING 1)
   SELECT count(*) FROM removed $$;

CREATE FUNCTION hms.purge_published_outbox_events() RETURNS bigint
  LANGUAGE sql SECURITY DEFINER SET search_path = hms, pg_temp AS
$$ WITH removed AS (
     DELETE FROM hms.outbox_event WHERE published_at < now() - INTERVAL '30 days' RETURNING 1)
   SELECT count(*) FROM removed $$;

REVOKE ALL ON FUNCTION hms.purge_expired_idempotency_records() FROM PUBLIC;
REVOKE ALL ON FUNCTION hms.purge_published_outbox_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hms.purge_expired_idempotency_records() TO hms_app;
GRANT EXECUTE ON FUNCTION hms.purge_published_outbox_events() TO hms_app;
