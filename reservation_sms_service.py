import logging
import os
from datetime import timedelta

from booking_service import (
    RESTAURANT_TZ,
    format_sets_display,
    reservation_payload,
)
from db import execute, query_all
from phone_utils import normalize_phone, phones_for_sms_api
from request_context import get_restaurant_id, set_restaurant_id
from sms_service import send_sms, sms_enabled

logger = logging.getLogger(__name__)

SMS_REMINDER_HOURS_BEFORE = int(os.getenv("SMS_REMINDER_HOURS_BEFORE", "2"))


def _message_for_event(event_type, reservation):
    rid = reservation.get("id")
    date = reservation.get("date")
    time = reservation.get("time")
    guests = reservation.get("guests")
    sets = format_sets_display(reservation.get("sets"))
    if event_type == "confirmed":
        return (
            f"Бронь #{rid} подтверждена. {date} {time}, гостей: {guests}, "
            f"сеты: {sets}."
        )
    if event_type == "edited":
        return (
            f"Бронь #{rid} изменена. Новые данные: {date} {time}, гостей: {guests}, "
            f"сеты: {sets}."
        )
    if event_type == "cancelled":
        return f"Бронь #{rid} отменена. Если это ошибка, свяжитесь с рестораном."
    if event_type == "reminder_2h":
        return (
            f"Напоминание: через {SMS_REMINDER_HOURS_BEFORE} ч. бронь #{rid}. "
            f"{date} {time}, гостей: {guests}."
        )
    raise ValueError("Unsupported reservation sms event")


def _notification_target(phone):
    normalized = normalize_phone(phone or "")
    if not normalized:
        return None
    return phones_for_sms_api(normalized)


def _reservation_by_id(reservation_id):
    row = query_all(
        """
        SELECT r.*, STRING_AGG(rt.table_id::text, ',' ORDER BY rt.table_id) AS table_ids
        FROM reservations r
        LEFT JOIN reservation_tables rt ON rt.reservation_id = r.id
        WHERE r.id = %s AND r.restaurant_id = %s
        GROUP BY r.id
        """,
        (reservation_id, get_restaurant_id()),
    )
    if not row:
        return None
    return reservation_payload(row[0])


def send_reservation_sms(event_type, reservation, scheduled_for=None):
    if not reservation:
        return {"sent": False, "reason": "missing_reservation"}
    if not sms_enabled():
        return {"sent": False, "reason": "sms_disabled"}
    target = _notification_target(reservation.get("phone"))
    if not target:
        return {"sent": False, "reason": "missing_phone"}
    message = _message_for_event(event_type, reservation)
    try:
        response = send_sms(target, message)
        if not response.get("sent"):
            return {"sent": False, "reason": "sms_disabled"}
        execute(
            """
            INSERT INTO reservation_sms_notifications (reservation_id, event_type, scheduled_for, sent_at)
            VALUES (%s, %s, %s, NOW())
            ON CONFLICT (reservation_id, event_type, scheduled_for) DO NOTHING
            """,
            (int(reservation["id"]), event_type, scheduled_for),
        )
        return {"sent": True, "response": response}
    except Exception as exc:
        logger.exception(
            "Reservation SMS send failed: event=%s reservation_id=%s error=%s",
            event_type,
            reservation.get("id"),
            exc,
        )
        return {"sent": False, "reason": "send_failed"}


def _candidates_for_reminder():
    """
    All confirmed future reservations that should get a 2h-before SMS now.
    Uses restaurant TZ in SQL (same as the rest of the app). No business-hours filter.
    """
    return query_all(
        """
        SELECT r.id, r.reservation_time
        FROM reservations r
        WHERE r.restaurant_id = %s
          AND r.status = 'confirmed'
          AND COALESCE(TRIM(r.phone), '') <> ''
          AND r.reservation_time > (timezone(%s, now()))::timestamp
          AND r.reservation_time - (%s * INTERVAL '1 hour')
              <= (timezone(%s, now()))::timestamp
          AND NOT EXISTS (
            SELECT 1
            FROM reservation_sms_notifications n
            WHERE n.reservation_id = r.id
              AND n.event_type = 'reminder_2h'
          )
        ORDER BY r.reservation_time ASC
        """,
        (
            get_restaurant_id(),
            RESTAURANT_TZ,
            SMS_REMINDER_HOURS_BEFORE,
            RESTAURANT_TZ,
        ),
    )


def send_due_reservation_reminders():
    """Send 2h-before reminders for every eligible reservation (not a narrow time slot)."""
    now_row = query_all(
        "SELECT (timezone(%s, now()))::timestamp AS now_local",
        (RESTAURANT_TZ,),
    )
    now_local = now_row[0]["now_local"] if now_row else None

    rows = _candidates_for_reminder()
    sent = 0
    skipped = 0
    for row in rows:
        reservation_time = row["reservation_time"]
        scheduled_for = reservation_time - timedelta(hours=SMS_REMINDER_HOURS_BEFORE)
        reservation = _reservation_by_id(row["id"])
        if not reservation:
            skipped += 1
            continue
        result = send_reservation_sms(
            "reminder_2h", reservation, scheduled_for=scheduled_for
        )
        if result.get("sent"):
            sent += 1
            logger.info(
                "Reminder SMS sent: reservation_id=%s at=%s phone=%s",
                row["id"],
                reservation_time,
                reservation.get("phone"),
            )
        else:
            logger.warning(
                "Reminder SMS not sent: reservation_id=%s reason=%s",
                row["id"],
                result.get("reason"),
            )

    return {
        "sent": sent,
        "candidates": len(rows),
        "skipped": skipped,
        "now": now_local.isoformat() if now_local else None,
        "tz": RESTAURANT_TZ,
        "hours_before": SMS_REMINDER_HOURS_BEFORE,
        "sms_enabled": sms_enabled(),
    }


def send_due_reservation_reminders_all_restaurants():
    rows = query_all("SELECT id FROM restaurants ORDER BY id")
    result = {
        "restaurants": 0,
        "candidates": 0,
        "sent": 0,
        "skipped": 0,
        "runs": [],
    }
    for row in rows:
        set_restaurant_id(int(row["id"]))
        stat = send_due_reservation_reminders()
        result["restaurants"] += 1
        result["candidates"] += int(stat["candidates"])
        result["sent"] += int(stat["sent"])
        result["skipped"] += int(stat["skipped"])
        result["runs"].append({"restaurant_id": row["id"], **stat})
    return result
