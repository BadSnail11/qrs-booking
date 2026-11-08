#!/usr/bin/env bash
# Build and start the production stack on the Oracle VM.
# Run from anywhere; script cd's to the repo root.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env.prod"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"

cd "${REPO_ROOT}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}" >&2
  echo "Copy deploy/.env.prod.example → deploy/.env.prod and fill required values." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "${ENV_FILE}"
set +a

required=(DOMAIN ACME_EMAIL ADMIN_WEB_URL DB_NAME DB_USER DB_PASSWORD SUPERADMIN_LOGIN SUPERADMIN_PASSWORD ADMIN_SESSION_SECRET PHONE_VERIFICATION_SALT)
missing=()
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    missing+=("${key}")
  fi
done
if ((${#missing[@]})); then
  echo "Missing required env vars in deploy/.env.prod: ${missing[*]}" >&2
  exit 1
fi

for weak in CHANGE_ME CHANGE_ME_STRONG_DB_PASSWORD CHANGE_ME_STRONG_ADMIN_PASSWORD CHANGE_ME_LONG_RANDOM_STRING CHANGE_ME_ANOTHER_RANDOM_STRING; do
  if grep -qE "^(DB_PASSWORD|SUPERADMIN_PASSWORD|ADMIN_SESSION_SECRET|PHONE_VERIFICATION_SALT)=${weak}$" "${ENV_FILE}"; then
    echo "Replace placeholder secrets in deploy/.env.prod before deploying." >&2
    exit 1
  fi
done

echo "==> Building and starting stack"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build

echo "==> Waiting for health endpoints"
sleep 5
if command -v curl >/dev/null 2>&1; then
  curl -fsS "https://${DOMAIN}/health/user" && echo "  user OK" || echo "  user health not ready yet (DNS/TLS may still be provisioning)"
  curl -fsS "https://${DOMAIN}/health/admin" && echo "  admin OK" || echo "  admin health not ready yet"
fi

echo
echo "Deploy complete."
echo "  Site:  https://${DOMAIN}"
echo "  Admin: ${ADMIN_WEB_URL}"
echo "Logs:   docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod logs -f"
