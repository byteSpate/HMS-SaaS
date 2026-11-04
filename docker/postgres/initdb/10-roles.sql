-- DEV ONLY: runs once when the local Postgres volume is first created.
-- Role model from E / ADR-003: migrations run as hms_migrator, the application connects as hms_app,
-- which can never bypass row-level security. The relay role is T-PLT-03; the control role arrives with T-DB-01.
CREATE ROLE hms_migrator LOGIN CREATEDB PASSWORD 'dev_migrator';
CREATE ROLE hms_app LOGIN NOBYPASSRLS PASSWORD 'dev_app';
-- Reads the outbox across hospitals and nothing else; its grants are in the T-PLT-03 migration.
CREATE ROLE hms_relay LOGIN BYPASSRLS PASSWORD 'dev_relay';

CREATE SCHEMA hms AUTHORIZATION hms_migrator;
GRANT USAGE ON SCHEMA hms TO hms_app;

-- Patient name matching (T-PAT-01). hms_migrator cannot create extensions, so it is made here,
-- as on Supabase (docker/postgres/supabase/30-pg-trgm.sql).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA hms;

-- Tables created by future migrations become usable by the app. Append-only tables revoke
-- UPDATE/DELETE in their own migration (ADR-009).
ALTER DEFAULT PRIVILEGES FOR ROLE hms_migrator IN SCHEMA hms
  GRANT SELECT, INSERT, UPDATE ON TABLES TO hms_app;
ALTER DEFAULT PRIVILEGES FOR ROLE hms_migrator IN SCHEMA hms
  GRANT USAGE, SELECT ON SEQUENCES TO hms_app;
