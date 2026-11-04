-- Supabase setup for patient name matching (T-PAT-01; FR-PAT-011, FR-I18N-003; E section 7).
-- Run once per Supabase project as the `postgres` user, BEFORE the T-PAT-01 migration:
--   psql "$SUPABASE_ADMIN_URL" -f docker/postgres/supabase/30-pg-trgm.sql
-- hms_migrator cannot create extensions. The extension goes into the hms schema, where the app's SQL
-- calls it by name (hms.similarity, OPERATOR(hms.%)); the migration refuses to run otherwise.
\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA hms;
