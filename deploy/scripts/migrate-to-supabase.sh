#!/usr/bin/env bash
# Copy the production database from the local Postgres container into Supabase,
# into its own schema (default: booking) next to the QRS platform tables in
# public, which are never touched.
#
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
#     bash deploy/scripts/migrate-to-supabase.sh
#
# Use the *session* pooler (port 5432) or the direct connection, not the
# transaction pooler (6543). App services are stopped during the copy so no
# reservation is written to the old database after the dump; they stay stopped
# until you switch DATABASE_URL and run update.sh.
#
# FORCE=1 drops and recreates the target schema (only that schema).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env.prod"
COMPOSE=(docker compose -f "${DEPLOY_DIR}/docker-compose.prod.yml" --env-file "${ENV_FILE}")
PG_CLIENT_IMAGE="${PG_CLIENT_IMAGE:-postgres:17}"
SCHEMA="${SCHEMA:-booking}"
APP_SERVICES=(booking-harats user-app admin-app sms-reminders iiko-sync)

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the Supabase session-pooler or direct connection string}"
if [[ "${SUPABASE_DB_URL}" == *":6543/"* ]]; then
  echo "SUPABASE_DB_URL points at the transaction pooler (6543); use port 5432." >&2
  exit 1
fi
if [[ ! "${SCHEMA}" =~ ^[a-z_][a-z0-9_]*$ || "${SCHEMA}" == "public" ]]; then
  echo "SCHEMA must be a plain lowercase name other than public" >&2
  exit 1
fi

cd "${REPO_ROOT}"
set -a; source "${ENV_FILE}"; set +a

remote_psql() {
  docker run --rm -i -e PGSSLMODE=require "${PG_CLIENT_IMAGE}" psql "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -qAt "$@"
}
local_dump() {
  "${COMPOSE[@]}" exec -T postgres pg_dump -U "${DB_USER}" -d "${DB_NAME}" --schema=public --no-owner --no-privileges "$@"
}
local_psql() {
  "${COMPOSE[@]}" exec -T postgres psql -U "${DB_USER}" -d "${DB_NAME}" -qAt "$@"
}
# Rewrite schema-qualified names public.x → <schema>.x in DDL; drop statements about the public schema itself.
to_schema_ddl() {
  sed -E -e '/^(CREATE|COMMENT ON|ALTER) SCHEMA public/d' \
         -e "s/(^|[^A-Za-z0-9_])public\./\1${SCHEMA}./g"
}
# In data sections only COPY headers and sequence setval calls name the schema; rows stay untouched.
to_schema_data() {
  sed -E -e "s/^COPY public\./COPY ${SCHEMA}./" \
         -e "s/^SELECT pg_catalog\.setval\('public\./SELECT pg_catalog.setval('${SCHEMA}./"
}

echo "==> Checking Supabase"
remote_psql -c "SELECT version()" | head -1
existing="$(remote_psql -c "SELECT to_regclass('${SCHEMA}.reservations') IS NOT NULL")"
if [[ "${existing}" == "t" && "${FORCE:-}" != "1" ]]; then
  echo "Supabase already has ${SCHEMA}.reservations. Re-run with FORCE=1 to replace schema ${SCHEMA}." >&2
  exit 1
fi

echo "==> Stopping app services (Postgres keeps running)"
"${COMPOSE[@]}" stop "${APP_SERVICES[@]}"

mkdir -p "${DEPLOY_DIR}/backups"
BACKUP="${DEPLOY_DIR}/backups/qrs-$(date +%Y%m%d-%H%M%S).dump"
echo "==> Backup of the local database: ${BACKUP}"
"${COMPOSE[@]}" exec -T postgres pg_dump -U "${DB_USER}" -d "${DB_NAME}" --format=custom > "${BACKUP}"

echo "==> Creating schema ${SCHEMA} in Supabase"
remote_psql -c "DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA};"

# Constraints and indexes (post-data) go in after the rows, so foreign keys —
# including the self-reference on tables.unite_with_table_id — never block COPY.
echo "==> Tables"
local_dump --section=pre-data | to_schema_ddl | remote_psql
echo "==> Data"
local_dump --section=data | to_schema_data | remote_psql
echo "==> Constraints and indexes"
local_dump --section=post-data | to_schema_ddl | remote_psql

echo "==> Applying idempotent migrations"
for f in sql/migrations/20261006_*.sql sql/migrations/20261101_*.sql; do
  [[ -f "$f" ]] || continue
  { echo "SET search_path TO ${SCHEMA};"; cat "$f"; } | remote_psql >/dev/null && echo "  $f"
done

echo "==> Comparing row counts"
mismatch=0
for t in $(local_psql -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1"); do
  src=$(local_psql -c "SELECT COUNT(*) FROM public.\"$t\"")
  dst=$(remote_psql -c "SELECT COUNT(*) FROM ${SCHEMA}.\"$t\"")
  if [[ "$src" == "$dst" ]]; then
    printf "  %-34s %8s  OK\n" "$t" "$src"
  else
    printf "  %-34s %8s → %s  MISMATCH\n" "$t" "$src" "$dst"
    mismatch=1
  fi
done
if ((mismatch)); then
  echo "Row counts differ — do NOT switch. App services are stopped; start them again with update.sh." >&2
  exit 1
fi

cat <<EOF

Copy complete, all row counts match. Backup: ${BACKUP}

Next, in deploy/.env.prod set:
  DATABASE_URL=<the same connection string as SUPABASE_DB_URL>
  DB_SSLMODE=require
  DB_SCHEMA=${SCHEMA}
then:
  bash deploy/scripts/update.sh
  ${COMPOSE[*]} exec admin-app python db_check.py
EOF
