"""Bidirectional iiko reserve sync for all restaurants.

Runs periodically. For each restaurant with iiko configured:
1. Check if terminal is alive — skip if not
2. Local -> iiko: push confirmed reservations that failed to sync
3. iiko -> local: pull reserves from iiko, create missing ones locally,
   cancel locally if cancelled in iiko, cancel in iiko if cancelled locally
"""

import logging
import os
import random
import string
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from db import execute, execute_returning, query_all, query_one
import iiko_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
)

logger = logging.getLogger(__name__)

RESTAURANT_TZ = os.getenv("RESTAURANT_TZ", "Europe/Moscow")
SLOT_MINUTES = int(os.getenv("SLOT_MINUTES", "120"))
SYNC_DAYS_AHEAD = int(os.getenv("IIKO_SYNC_DAYS_AHEAD", "14"))


def _get_iiko_restaurants():
    """Get all restaurants that have iiko configured."""
    return query_all(
        "SELECT id FROM restaurants WHERE iiko_api_login IS NOT NULL"
    )


def _push_local_to_iiko(restaurant_id):
    """Push confirmed local reservations that failed to sync to iiko."""
    from booking_service import _sync_reservation_to_iiko

    rows = query_all(
        """
        SELECT id FROM reservations
        WHERE restaurant_id = %s AND status = 'confirmed'
          AND iiko_reserve_id IS NULL
          AND (iiko_creation_status = 'Error' OR iiko_creation_status IS NULL)
          AND reservation_time > NOW()
        ORDER BY reservation_time
        """,
        (restaurant_id,),
    )
    if not rows:
        return 0

    success = 0
    for row in rows:
        _sync_reservation_to_iiko(row["id"], restaurant_id)
        updated = query_one(
            "SELECT iiko_creation_status FROM reservations WHERE id = %s",
            (row["id"],),
        )
        if updated and updated["iiko_creation_status"] not in ("Error", None):
            success += 1
    logger.info(
        "Local->iiko push for restaurant %s: %s/%s synced",
        restaurant_id, success, len(rows),
    )
    return success


def _pull_iiko_to_local(restaurant_id):
    """Pull reserves from iiko and sync with local DB.

    - New in iiko (not in local): create local reservation
    - Cancelled in iiko but confirmed locally: cancel locally
    - Cancelled locally but active in iiko: cancel in iiko
    """
    tz = ZoneInfo(RESTAURANT_TZ)
    now = datetime.now(tz)
    date_from = now.strftime("%Y-%m-%dT00:00:00.000")
    date_to = (now + timedelta(days=SYNC_DAYS_AHEAD)).strftime("%Y-%m-%dT23:59:59.000")

    iiko_reserves = iiko_service.get_reserves_workload(restaurant_id, date_from, date_to)
    if not iiko_reserves:
        logger.info("iiko->local pull for restaurant %s: no reserves in iiko", restaurant_id)
        return {"created": 0, "cancelled_local": 0, "cancelled_iiko": 0}

    stats = {"created": 0, "cancelled_local": 0, "cancelled_iiko": 0}

    # Build a set of iiko reserve IDs we know about locally
    local_rows = query_all(
        """
        SELECT iiko_reserve_id::text, status
        FROM reservations
        WHERE restaurant_id = %s AND iiko_reserve_id IS NOT NULL
        """,
        (restaurant_id,),
    )
    local_by_iiko_id = {r["iiko_reserve_id"]: r["status"] for r in local_rows}

    iiko_active_ids = set()
    for reserve in iiko_reserves:
        iiko_id = reserve.get("id")
        if not iiko_id:
            continue

        iiko_status = reserve.get("status", "")
        iiko_active_ids.add(iiko_id)

        if iiko_id in local_by_iiko_id:
            local_status = local_by_iiko_id[iiko_id]

            # Cancelled in iiko but still confirmed locally -> cancel locally
            if iiko_status in ("Cancelled", "Deleted") and local_status == "confirmed":
                execute(
                    """
                    UPDATE reservations
                    SET status = 'cancelled',
                        cancelled_at = NOW(),
                        admin_note = COALESCE(admin_note, '') || ' [cancelled in iiko]',
                        updated_at = NOW()
                    WHERE iiko_reserve_id = %s::uuid AND restaurant_id = %s
                    """,
                    (iiko_id, restaurant_id),
                )
                logger.info("Cancelled local reservation (iiko reserve %s cancelled in POS)", iiko_id)
                stats["cancelled_local"] += 1

            # Cancelled locally but still active in iiko -> cancel in iiko
            elif local_status == "cancelled" and iiko_status not in ("Cancelled", "Deleted"):
                try:
                    iiko_service.cancel_reserve(restaurant_id, iiko_id, "Other")
                    logger.info("Cancelled iiko reserve %s (local reservation cancelled)", iiko_id)
                    stats["cancelled_iiko"] += 1
                except RuntimeError as e:
                    logger.error("Failed to cancel iiko reserve %s: %s", iiko_id, e)

        else:
            # New in iiko, doesn't exist locally — but check for unlinked match first
            if _try_link_existing(restaurant_id, reserve):
                stats["linked"] = stats.get("linked", 0) + 1
            else:
                if _create_local_from_iiko(restaurant_id, reserve):
                    stats["created"] += 1

    # Cancelled reserves disappear from workload entirely — check any confirmed local
    # reservations linked to iiko that are missing from the workload response.
    for iiko_id, local_status in local_by_iiko_id.items():
        if local_status != "confirmed":
            continue
        if iiko_id in iiko_active_ids:
            continue
        # This reserve was not in the workload — check its actual status in iiko
        try:
            status_data = iiko_service.get_reserve_status(restaurant_id, iiko_id)
            if not status_data:
                continue
            detail = (status_data or {}).get("reserve") or {}
            is_deleted = status_data.get("isDeleted")
            iiko_status = detail.get("status", "")
            if is_deleted or iiko_status in ("Cancelled", "Deleted"):
                execute(
                    """
                    UPDATE reservations
                    SET status = 'cancelled',
                        cancelled_at = NOW(),
                        admin_note = COALESCE(admin_note, '') || ' [cancelled in iiko]',
                        updated_at = NOW()
                    WHERE iiko_reserve_id = %s::uuid AND restaurant_id = %s
                    """,
                    (iiko_id, restaurant_id),
                )
                logger.info("Cancelled local reservation (iiko reserve %s missing/deleted from POS)", iiko_id)
                stats["cancelled_local"] += 1
        except Exception as e:
            logger.error("Failed to check status of missing iiko reserve %s: %s", iiko_id, e)

    logger.info(
        "iiko->local pull for restaurant %s: created=%s linked=%s cancelled_local=%s cancelled_iiko=%s",
        restaurant_id, stats["created"], stats.get("linked", 0),
        stats["cancelled_local"], stats["cancelled_iiko"],
    )
    return stats


def _try_link_existing(restaurant_id, iiko_reserve):
    """Try to find an unlinked local reservation that matches this iiko reserve.

    Matches by reservation_time (within 5 min) and guest count.
    If found, links them by setting iiko_reserve_id.
    """
    iiko_id = iiko_reserve.get("id")
    est_time_str = iiko_reserve.get("estimatedStartTime", "")
    if not est_time_str:
        return False
    est_time_str = est_time_str.replace(" ", "T")
    try:
        reservation_time = datetime.fromisoformat(est_time_str.split(".")[0])
    except ValueError:
        return False

    guests = iiko_reserve.get("guestsCount", 0)

    match = query_one(
        """
        SELECT id FROM reservations
        WHERE restaurant_id = %s
          AND iiko_reserve_id IS NULL
          AND status IN ('confirmed', 'pending')
          AND guests = %s
          AND ABS(EXTRACT(EPOCH FROM (reservation_time - %s::timestamp))) < 300
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (restaurant_id, guests, reservation_time),
    )
    if not match:
        return False

    execute(
        """
        UPDATE reservations
        SET iiko_reserve_id = %s::uuid,
            iiko_creation_status = 'Success',
            updated_at = NOW()
        WHERE id = %s
        """,
        (iiko_id, match["id"]),
    )
    logger.info("Linked local reservation %s to iiko reserve %s", match["id"], iiko_id)
    return True


def _create_local_from_iiko(restaurant_id, iiko_reserve):
    """Create a local reservation from an iiko reserve."""
    iiko_id = iiko_reserve.get("id")
    iiko_status = iiko_reserve.get("status", "")

    # Skip cancelled/deleted reserves
    if iiko_status in ("Cancelled", "Deleted"):
        return False

    # Get full details via status_by_id for phone number etc.
    # status_by_id returns {id, isDeleted, reserve: {customer, guestsCount, status, ...}, ...}
    status_data = iiko_service.get_reserve_status(restaurant_id, iiko_id)
    detail = (status_data or {}).get("reserve") or {}

    # Also check status from detail
    if (status_data or {}).get("isDeleted") or detail.get("status") in ("Cancelled", "Deleted"):
        return False

    # Merge: prefer detail (full data) over workload (summary)
    src = {**iiko_reserve, **{k: v for k, v in detail.items() if v is not None}}

    customer = src.get("customer", {}) or {}
    customer_name_parts = []
    if customer.get("name"):
        customer_name_parts.append(customer["name"])
    if customer.get("surname"):
        customer_name_parts.append(customer["surname"])
    customer_name = " ".join(customer_name_parts) or "iiko Guest"

    phone = src.get("phone") or ""
    guests = src.get("guestsCount", 1)
    comment = src.get("comment", "")
    duration = src.get("durationInMinutes", SLOT_MINUTES)

    # Parse estimated start time
    est_time_str = src.get("estimatedStartTime", "")
    if not est_time_str:
        logger.warning("iiko reserve %s has no estimatedStartTime, skipping", iiko_id)
        return False
    # iiko returns "2026-05-28 19:00:00.000" (space separator)
    est_time_str = est_time_str.replace(" ", "T")
    try:
        reservation_time = datetime.fromisoformat(est_time_str.split(".")[0])
    except ValueError:
        logger.error("Cannot parse iiko time '%s' for reserve %s", est_time_str, iiko_id)
        return False

    # Convert iiko table UUIDs to local table IDs
    iiko_table_ids = src.get("tableIds") or []
    local_table_ids = iiko_service.get_local_table_ids(iiko_table_ids) if iiko_table_ids else []

    confirmation_code = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))

    iiko_customer_id = customer.get("id")

    # Check if this iiko_reserve_id already exists (from a previous partial sync)
    existing = query_one(
        "SELECT id FROM reservations WHERE iiko_reserve_id = %s::uuid",
        (iiko_id,),
    )
    if existing:
        logger.info("iiko reserve %s already linked to reservation %s, skipping", iiko_id, existing["id"])
        return False

    row = execute_returning(
        """
        INSERT INTO reservations (
            restaurant_id, customer_name, reservation_time, guests, sets, email, phone,
            note, status, confirmation_code, created_by_admin, admin_note,
            iiko_reserve_id, iiko_customer_id, iiko_creation_status,
            duration_minutes, event_type, updated_at
        )
        VALUES (%s, %s, %s, %s, 0, NULL, %s, %s, 'confirmed', %s, FALSE, %s,
                %s::uuid, %s::uuid, 'Success', %s, 'iiko', NOW())
        RETURNING id
        """,
        (
            restaurant_id,
            customer_name,
            reservation_time,
            guests,
            phone,
            comment,
            confirmation_code,
            "[created in iiko POS]",
            iiko_id,
            iiko_customer_id,
            duration,
        ),
    )

    if row and local_table_ids:
        for table_id in local_table_ids:
            execute(
                "INSERT INTO reservation_tables (reservation_id, table_id) VALUES (%s, %s)",
                (row["id"], table_id),
            )

    logger.info(
        "Created local reservation %s from iiko reserve %s (%s, %s guests)",
        row["id"] if row else "?", iiko_id, customer_name, guests,
    )
    return True


def sync_restaurant(restaurant_id):
    """Full bidirectional sync for one restaurant."""
    if not iiko_service.is_terminal_alive(restaurant_id):
        logger.info("Restaurant %s: iiko terminal offline, skipping sync", restaurant_id)
        return False

    logger.info("Restaurant %s: terminal alive, starting sync", restaurant_id)
    _push_local_to_iiko(restaurant_id)
    _pull_iiko_to_local(restaurant_id)
    return True


def main():
    restaurants = _get_iiko_restaurants()
    if not restaurants:
        print("iiko sync: no restaurants with iiko configured")
        return

    for r in restaurants:
        sync_restaurant(r["id"])


if __name__ == "__main__":
    main()
