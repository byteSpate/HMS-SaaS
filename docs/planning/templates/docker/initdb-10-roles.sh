#!/usr/bin/env bash
# =====================================================================================
# TEMPLATE — UNTESTED. First-boot role creation for the official postgres image
# (/docker-entrypoint-initdb.d runs only when the data directory is empty).
# Passwords come from Docker secrets mounted at /run/secrets/*. Schema objects and grants
# are created by migrations (hms_migrator), not here. Role design: docs/E-database-design.md §6.
# =====================================================================================
set -euo pipefail

read_secret() { tr -d '\n' < "/run/secrets/$1"; }

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_pw="$(read_secret db_app_password)" \
  -v mig_pw="$(read_secret db_migrator_password)" \
  -v ro_pw="$(read_secret db_readonly_password)" <<'SQL'
CREATE ROLE hms_owner NOLOGIN;
CREATE ROLE hms_migrator LOGIN PASSWORD :'mig_pw' IN ROLE hms_owner;
CREATE ROLE hms_app      LOGIN PASSWORD :'app_pw';
CREATE ROLE hms_readonly LOGIN PASSWORD :'ro_pw';
GRANT CONNECT ON DATABASE hms TO hms_app, hms_readonly, hms_migrator;
GRANT CREATE ON DATABASE hms TO hms_owner;
SQL
# hms_backup is created when the backup component is deployed.
