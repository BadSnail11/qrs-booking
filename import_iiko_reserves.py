"""Import iiko reserves for a date range into the database the app is configured for.

    python import_iiko_reserves.py --from 2026-07-01 --to 2027-01-01 --dry-run
    python import_iiko_reserves.py --from 2026-07-01 --to 2027-01-01

--to is inclusive (the whole day). Safe to re-run: reserves already linked by
iiko_reserve_id are left as they are, local reservations that match an unlinked
iiko reserve (same time ±5 min, same guests) are linked instead of duplicated.
Imported rows are written directly, so no SMS, email, Telegram or iiko push fires.
"""

import argparse
import logging
import random
import string
import sys
from collections import Counter
from datetime import date, datetime, timedelta

import iiko_service
from booking_service import SLOT_MINUTES
from db import execute, execute_returning, query_all, query_one
from retry_iiko_sync import _try_link_existing

logger = logging.getLogger("import_iiko_reserves")

CHUNK_DAYS = 7
CANCELLED = ("Cancelled", "Deleted")


def _parse_iiko_time(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace(" ", "T").split(".")[0])
    except ValueError:
        return None


def _local_status(entry, detail, start):
    """Map iiko state onto reservations.status / arrival_status."""
    iiko_status = detail.get("status") or entry.get("status") or ""
    if entry.get("isDeleted") or iiko_status in CANCELLED:
        return "cancelled", None
    if iiko_status == "Closed":
        return "completed", "arrived"
    if iiko_status == "Started":
        return "confirmed", "arrived"
    return "confirmed", None


def _unlinked_match_exists(restaurant_id, start, guests):
    """Read-only twin of retry_iiko_sync._try_link_existing's match, for --dry-run."""
    return query_one(
        """
        SELECT 1 FROM reservations
        WHERE restaurant_id = %s AND iiko_reserve_id IS NULL
          AND status IN ('confirmed', 'pending') AND guests = %s
          AND ABS(EXTRACT(EPOCH FROM (reservation_time - %s::timestamp))) < 300
        LIMIT 1
        """,
        (restaurant_id, guests, start),
    ) is not None


def _chunks(day_from, day_to):
    start = day_from
    while start <= day_to:
        end = min(start + timedelta(days=CHUNK_DAYS - 1), day_to)
        yield start, end
        start = end + timedelta(days=1)


def fetch_reserves(restaurant_id, day_from, day_to):
    """All reserves touching the range, keyed by iiko id (chunks overlap at edges)."""
    found = {}
    for start, end in _chunks(day_from, day_to):
        rows = iiko_service.get_reserves_workload(
            restaurant_id,
            f"{start.isoformat()}T00:00:00.000",
            f"{end.isoformat()}T23:59:59.000",
        )
        for r in rows:
            if r.get("id"):
                found[r["id"]] = r
        logger.info("workload %s..%s: %s reserves", start, end, len(rows))
    return found


def import_restaurant(restaurant_id, day_from, day_to, dry_run):
    stats = Counter()
    workload = fetch_reserves(restaurant_id, day_from, day_to)
    details = iiko_service.get_reserves_status(restaurant_id, list(workload))
    linked = {
        r["iiko_reserve_id"]
        for r in query_all(
            "SELECT iiko_reserve_id::text AS iiko_reserve_id FROM reservations WHERE iiko_reserve_id IS NOT NULL"
        )
    }

    for iiko_id, summary in sorted(workload.items(), key=lambda kv: kv[1].get("estimatedStartTime") or ""):
        entry = details.get(iiko_id) or {}
        detail = entry.get("reserve") or {}
        src = {**summary, **{k: v for k, v in detail.items() if v is not None}}
        start = _parse_iiko_time(src.get("estimatedStartTime"))
        if start is None or not (day_from <= start.date() <= day_to):
            stats["outside_range_or_no_time"] += 1
            continue
        status, arrival = _local_status(entry, detail, start)
        stats[f"iiko_{status}"] += 1

        if iiko_id in linked:
            stats["already_in_db"] += 1
            continue
        if status != "cancelled":
            if dry_run:
                if _unlinked_match_exists(restaurant_id, start, int(src.get("guestsCount") or 0)):
                    stats["would_link_to_existing"] += 1
                    continue
            elif _try_link_existing(restaurant_id, {**src, "id": iiko_id}):
                stats["linked_to_existing"] += 1
                linked.add(iiko_id)
                continue
        if status == "cancelled":
            stats["skipped_cancelled"] += 1
            continue

        customer = src.get("customer") or {}
        name = " ".join(x for x in (customer.get("name"), customer.get("surname")) if x) or "iiko Guest"
        table_ids = iiko_service.get_local_table_ids(src.get("tableIds") or [])
        if not table_ids:
            stats["no_table_mapping"] += 1
        if dry_run:
            stats["would_import"] += 1
            continue

        row = execute_returning(
            """
            INSERT INTO reservations (
                restaurant_id, customer_name, reservation_time, guests, sets, email, phone,
                note, status, arrival_status, confirmation_code, created_by_admin, admin_note,
                iiko_reserve_id, iiko_customer_id, iiko_creation_status,
                duration_minutes, event_type, updated_at
            )
            VALUES (%s, %s, %s, %s, 0, NULL, %s, %s, %s, %s, %s, FALSE, %s,
                    %s::uuid, %s::uuid, 'Success', %s, 'iiko', NOW())
            ON CONFLICT DO NOTHING
            RETURNING id
            """,
            (
                restaurant_id,
                name,
                start,
                int(src.get("guestsCount") or 1),
                src.get("phone") or "",
                src.get("comment") or "",
                status,
                arrival,
                "".join(random.choices(string.ascii_uppercase + string.digits, k=8)),
                "[imported from iiko]",
                iiko_id,
                customer.get("id"),
                int(src.get("durationInMinutes") or SLOT_MINUTES),
            ),
        )
        if not row:
            stats["already_in_db"] += 1
            continue
        for table_id in table_ids:
            execute(
                "INSERT INTO reservation_tables (reservation_id, table_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (row["id"], table_id),
            )
        linked.add(iiko_id)
        stats["imported"] += 1
    stats["found_in_iiko"] = len(workload)
    return stats


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stdout)
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--from", dest="day_from", required=True, type=date.fromisoformat)
    parser.add_argument("--to", dest="day_to", required=True, type=date.fromisoformat)
    parser.add_argument("--dry-run", action="store_true", help="only report, write nothing")
    args = parser.parse_args()
    if args.day_to < args.day_from:
        parser.error("--to must not be before --from")

    restaurants = query_all("SELECT id, slug FROM restaurants WHERE iiko_api_login IS NOT NULL ORDER BY id")
    if not restaurants:
        print("No restaurants with iiko configured")
        return 2
    target = query_one("SELECT current_database() AS db, inet_server_addr()::text AS host")
    print(f"Target DB: {target['db']} @ {target['host'] or 'local socket'}" + (" (dry run)" if args.dry_run else ""))
    for r in restaurants:
        stats = import_restaurant(int(r["id"]), args.day_from, args.day_to, args.dry_run)
        print(f"\n[{r['slug']}] {args.day_from} .. {args.day_to}")
        for key in ("found_in_iiko", "iiko_confirmed", "iiko_completed", "iiko_cancelled", "already_in_db",
                    "linked_to_existing", "would_link_to_existing", "would_import", "imported", "skipped_cancelled", "no_table_mapping",
                    "outside_range_or_no_time"):
            if stats.get(key):
                print(f"  {key}: {stats[key]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
