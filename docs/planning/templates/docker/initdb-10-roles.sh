#!/usr/bin/env bash
# =====================================================================================
# TEMPLATE — UNTESTED. First-boot role creation for the official postgres image
# (/docker-entrypoint-initdb.d runs only when the data directory is empty).
# Passwords come from Docker secrets mounted at /run/secrets/*. Schema objects, RLS and grants
# are created by migrations (hms_migrator), not here. Role design: docs/E-database-design.md §6.
# =====================================================================================
set -euo pipefail

read_secret() { tr -d '\n' < "/run/secrets/$1"; }

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_pw="$(read_secret db_app_password)" \
  -v mig_pw="$(read_secret db_migrator_password)" \
  -v relay_pw="$(read_secret db_relay_password)" \
  -v ro_pw="$(read_secret db_readonly_password)" <<'SQL'
CREATE ROLE hms_owner NOLOGIN;
CREATE ROLE hms_migrator LOGIN PASSWORD :'mig_pw' IN ROLE hms_owner;
CREATE ROLE hms_app      LOGIN PASSWORD :'app_pw'   NOBYPASSRLS;
CREATE ROLE hms_readonly LOGIN PASSWORD :'ro_pw'    NOBYPASSRLS;
CREATE ROLE hms_relay    LOGIN PASSWORD :'relay_pw' BYPASSRLS;   -- grants limited to outbox_event (E §6.1)
GRANT CONNECT ON DATABASE hms TO hms_app, hms_readonly, hms_relay, hms_migrator;
GRANT CREATE ON DATABASE hms TO hms_owner;
SQL
# hms_control (vendor control plane) and hms_backup are created when those components are deployed.
