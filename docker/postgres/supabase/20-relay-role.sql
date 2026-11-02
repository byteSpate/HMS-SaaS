-- Supabase setup for the outbox relay (T-PLT-03; E section 6). Run once per Supabase project as the
-- `postgres` user, after the T-PLT-03 migration, passing the password as a psql variable:
--   psql "$SUPABASE_ADMIN_URL" -v relay_pw=... -f docker/postgres/supabase/20-relay-role.sql
-- The role bypasses RLS, so it receives only the outbox and two of its columns.
\set ON_ERROR_STOP on

CREATE ROLE hms_relay LOGIN BYPASSRLS PASSWORD :'relay_pw';
GRANT USAGE ON SCHEMA hms TO hms_relay;
GRANT SELECT ON hms.outbox_event TO hms_relay;
GRANT UPDATE (published_at, attempts) ON hms.outbox_event TO hms_relay;
