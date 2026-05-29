from datetime import datetime, timedelta

from db import execute_returning, query_all
from phone_utils import normalize_phone
from request_context import get_restaurant_id


def get_visitor_by_phone(restaurant_id, phone):
    phone_normalized = normalize_phone(phone)
    if not phone_normalized:
        return None
    rows = query_all(
        """
        SELECT id, phone, first_name, last_name, reservation_count, last_seen_at
        FROM visitors
        WHERE restaurant_id = %s
        """,
        (int(restaurant_id),),
    )
    for row in rows:
        if normalize_phone(row.get("phone") or "") == phone_normalized:
            return row
    return None


def is_phone_confirmed(restaurant_id, phone, *, valid_days=None) -> bool:
    """True if this phone completed a verified booking before (CRM visitor)."""
    visitor = get_visitor_by_phone(restaurant_id, phone)
    if not visitor:
        return False
    if valid_days is None:
        return True
    seen_at = visitor.get("last_seen_at")
    if not isinstance(seen_at, datetime):
        return False
    return seen_at >= datetime.utcnow() - timedelta(days=int(valid_days))


def upsert_visitor(
    restaurant_id,
    phone,
    first_name="",
    last_name="",
    *,
    increment_reservation=True,
    marketing_consent=None,
):
    phone_normalized = normalize_phone(phone)
    if not phone_normalized:
        return None
    display_phone = (phone or "").strip() or phone_normalized
    first_name = (first_name or "").strip()
    last_name = (last_name or "").strip()
    count = 1 if increment_reservation else 0
    count_bump = ", reservation_count = visitors.reservation_count + 1" if increment_reservation else ""

    if marketing_consent is None:
        return execute_returning(
            f"""
            INSERT INTO visitors (
                restaurant_id, phone, first_name, last_name, reservation_count
            )
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (restaurant_id, phone) DO UPDATE SET
                first_name = CASE
                    WHEN COALESCE(TRIM(visitors.first_name), '') = '' THEN EXCLUDED.first_name
                    ELSE visitors.first_name
                END,
                last_name = CASE
                    WHEN COALESCE(TRIM(visitors.last_name), '') = '' THEN EXCLUDED.last_name
                    ELSE visitors.last_name
                END,
                last_seen_at = NOW()
                {count_bump}
            RETURNING *
            """,
            (restaurant_id, display_phone, first_name, last_name, count),
        )

    mc = bool(marketing_consent)
    return execute_returning(
        f"""
        INSERT INTO visitors (
            restaurant_id, phone, first_name, last_name, reservation_count,
            marketing_consent, marketing_consent_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, CASE WHEN %s THEN NOW() ELSE NULL END)
        ON CONFLICT (restaurant_id, phone) DO UPDATE SET
            first_name = CASE
                WHEN COALESCE(TRIM(visitors.first_name), '') = '' THEN EXCLUDED.first_name
                ELSE visitors.first_name
            END,
            last_name = CASE
                WHEN COALESCE(TRIM(visitors.last_name), '') = '' THEN EXCLUDED.last_name
                ELSE visitors.last_name
            END,
            last_seen_at = NOW(),
            marketing_consent = EXCLUDED.marketing_consent,
            marketing_consent_at = CASE
                WHEN EXCLUDED.marketing_consent THEN NOW()
                ELSE NULL
            END
            {count_bump}
        RETURNING *
        """,
        (restaurant_id, display_phone, first_name, last_name, count, mc, mc),
    )


def list_visitors(restaurant_id=None, search=None, limit=500):
    rid = int(restaurant_id) if restaurant_id is not None else get_restaurant_id()
    params = [rid]
    where = "restaurant_id = %s"
    if search:
        term = f"%{search.strip().lower()}%"
        where += (
            " AND (LOWER(first_name) LIKE %s OR LOWER(last_name) LIKE %s"
            " OR LOWER(phone) LIKE %s OR phone LIKE %s)"
        )
        params.extend([term, term, term, f"%{search.strip()}%"])

    params.append(min(int(limit), 1000))
    rows = query_all(
        f"""
        SELECT
            id,
            phone,
            first_name,
            last_name,
            first_seen_at,
            last_seen_at,
            reservation_count
        FROM visitors
        WHERE {where}
        ORDER BY last_seen_at DESC
        LIMIT %s
        """,
        tuple(params),
    )
    return [
        {
            "id": row["id"],
            "phone": row["phone"],
            "firstName": row["first_name"] or "",
            "lastName": row["last_name"] or "",
            "firstSeenAt": row["first_seen_at"].isoformat() if row["first_seen_at"] else None,
            "lastSeenAt": row["last_seen_at"].isoformat() if row["last_seen_at"] else None,
            "reservationCount": int(row["reservation_count"] or 0),
        }
        for row in rows
    ]
