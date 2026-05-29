#!/bin/bash
set -euo pipefail

# Rebuild frontend + user/admin APIs + SMS reminder worker.
docker compose build --no-cache booking-harats user-app admin-app sms-reminders
docker compose up -d booking-harats user-app admin-app sms-reminders

