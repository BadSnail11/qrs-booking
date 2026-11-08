"""Show which database this app process actually talks to, and that data is there.

    docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod \\
        exec admin-app python db_check.py
"""

import os
import sys
import time
from urllib.parse import urlsplit

from db import query_all, query_one

TABLES = (
    "restaurants", "tables", "reservations", "reservation_tables", "visitors",
    "weekly_schedule", "schedule_date_overrides", "table_blocks", "telegram_recipients",
    "online_guest_limits", "reservation_sms_notifications", "iiko_request_log",
)


def configured_target():
    url = os.getenv("DATABASE_URL", "").strip()
    if url:
        parts = urlsplit(url)
        return f"DATABASE_URL → {parts.hostname}:{parts.port or 5432}/{parts.path.lstrip('/')} (user {parts.username})"
    return f"DB_HOST → {os.getenv('DB_HOST', 'postgres')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME', 'qrs_booking')}"


def main():
    print("Configured:", configured_target())
    info = query_one(
        """
        SELECT current_database() AS db, current_schema() AS schema, current_user AS usr, version() AS version,
               inet_server_addr()::text AS server_ip,
               (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl
        """
    )
    print(f"Connected: db={info['db']} schema={info['schema']} user={info['usr']} "
          f"server_ip={info['server_ip'] or 'local socket'} ssl={info['ssl']}")
    print("Server:", info["version"].split(",")[0])
    if "supabase" in configured_target().lower() or "pooler" in configured_target().lower():
        print("  → this is Supabase")

    present = {
        r["table_name"]
        for r in query_all("SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()")
    }
    print("\nRows per table:")
    for t in TABLES:
        if t in present:
            print(f"  {t:32} {query_one(f'SELECT COUNT(*) AS n FROM {t}')['n']}")
        else:
            print(f"  {t:32} — no table yet (created on first use)")

    span = query_one(
        "SELECT MIN(reservation_time) AS first, MAX(reservation_time) AS last, "
        "COUNT(*) FILTER (WHERE event_type = 'iiko') AS from_iiko FROM reservations"
    )
    print(f"\nReservations from {span['first']} to {span['last']}, of them from iiko: {span['from_iiko']}")
    months = query_all(
        "SELECT to_char(reservation_time, 'YYYY-MM') AS m, COUNT(*) AS n, "
        "COUNT(*) FILTER (WHERE event_type = 'iiko') AS iiko "
        "FROM reservations WHERE reservation_time >= '2026-07-01' GROUP BY 1 ORDER BY 1"
    )
    for m in months:
        print(f"  {m['m']}: {m['n']} (iiko: {m['iiko']})")

    started = time.perf_counter()
    for _ in range(20):
        query_one("SELECT 1 AS ok")
    per_query = (time.perf_counter() - started) / 20 * 1000
    print(f"\nLatency: {per_query:.1f} ms per query (pooled)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
