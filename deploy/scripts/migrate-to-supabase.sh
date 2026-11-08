#!/usr/bin/env bash
# Copy the production database from the local Postgres container into Supabase.
#
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require' \
#     bash deploy/scripts/migrate-to-supabase.sh
#
# Use the *session* pooler (port 5432) or the direct connection, not the
# transaction pooler (6543). App services are stopped during the copy so no
# reservation is written to the old database after the dump; they stay stopped
# until you switch DATABASE_URL and run update.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env.prod"
COMPOSE=(docker compose -f "${DEPLOY_DIR}/docker-compose.prod.yml" --env-file "${ENV_FILE}")
PG_CLIENT_IMAGE="${PG_CLIENT_IMAGE:-postgres:17}"
APP_SERVICES=(booking-harats user-app admin-app sms-reminders iiko-sync)

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the Supabase session-pooler or direct connection string}"
if [[ "${SUPABASE_DB_URL}" == *":6543/"* ]]; then
  echo "SUPABASE_DB_URL points at the transaction pooler (6543); use port 5432." >&2
  exit 1
fi

cd "${REPO_ROOT}"
set -a; source "${ENV_FILE}"; set +a

remote_psql() {
  docker run --rm -i "${PG_CLIENT_IMAGE}" psql "${SUPABASE_DB_URL}" -v ON_ERROR_STOP=1 -qAt "$@"
}

echo "==> Checking Supabase is reachable and empty"
remote_psql -c "SELECT version()" | head -1
if [[ "$(remote_psql -c "SELECT to_regclass('public.reservations') IS NOT NULL")" == "t" && "${FORCE:-}" != "1" ]]; then
  echo "Supabase already has a reservations table. Re-run with FORCE=1 to restore over it." >&2
  exit 1
fi

echo "==> Stopping app services (Postgres keeps running)"
"${COMPOSE[@]}" stop "${APP_SERVICES[@]}"

mkdir -p "${DEPLOY_DIR}/backups"
DUMP="${DEPLOY_DIR}/backups/qrs-$(date +%Y%m%d-%H%M%S).dump"
echo "==> Dumping local database to ${DUMP}"
"${COMPOSE[@]}" exec -T postgres pg_dump -U "${DB_USER}" -d "${DB_NAME}" \
  --format=custom --no-owner --no-privileges > "${DUMP}"

echo "==> Restoring into Supabase"
restore_flags=(--no-owner --no-privileges --exit-on-error)
[[ "${FORCE:-}" == "1" ]] && restore_flags+=(--clean --if-exists)
docker run --rm -i "${PG_CLIENT_IMAGE}" pg_restore "${restore_flags[@]}" -d "${SUPABASE_DB_URL}" < "${DUMP}"

echo "==> Applying idempotent migrations"
for f in sql/migrations/20261101_*.sql sql/migrations/20261006_*.sql; do
  [[ -f "$f" ]] && remote_psql < "$f" && echo "  $f"
done

echo "==> Comparing row counts"
mismatch=0
for t in $("${COMPOSE[@]}" exec -T postgres psql -U "${DB_USER}" -d "${DB_NAME}" -qAt \
            -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1"); do
  src=$("${COMPOSE[@]}" exec -T postgres psql -U "${DB_USER}" -d "${DB_NAME}" -qAt -c "SELECT COUNT(*) FROM \"$t\"")
  dst=$(remote_psql -c "SELECT COUNT(*) FROM \"$t\"")
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

Copy complete, all row counts match. Backup: ${DUMP}

Next:
  1. In deploy/.env.prod set DATABASE_URL to the same connection string as
     SUPABASE_DB_URL (keep ?sslmode=require)
  2. bash deploy/scripts/update.sh
  3. ${COMPOSE[*]} exec admin-app python db_check.py
EOF
