#!/bin/bash
# Set iiko credentials from environment variables (runs after init.sql)

if [ -n "$IIKO_API_LOGIN" ]; then
  echo "Setting iiko credentials for restaurant 1..."
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<-EOSQL
    UPDATE restaurants SET
      iiko_api_login = '$IIKO_API_LOGIN',
      iiko_organization_id = '$IIKO_ORGANIZATION_ID',
      iiko_terminal_group_id = '$IIKO_TERMINAL_GROUP_ID'
    WHERE id = 1;
EOSQL
else
  echo "IIKO_API_LOGIN not set, skipping iiko credentials."
fi
