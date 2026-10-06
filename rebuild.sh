#!/bin/bash
set -euo pipefail

# Rebuild frontend + user/admin APIs + SMS reminder and iiko sync workers.
# Every service that imports booking_service/iiko_service MUST be listed here:
# the code is baked into the image, so a skipped worker keeps running old code.
docker compose build --no-cache booking-harats user-app admin-app sms-reminders iiko-sync
docker compose up -d booking-harats user-app admin-app sms-reminders iiko-sync
