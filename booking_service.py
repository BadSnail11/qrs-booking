import csv
import io
import itertools
import os
import random
import string
from datetime import datetime, time, timedelta

from db import execute, execute_returning, query_all, query_one

SLOT_MINUTES = int(os.getenv("SLOT_MINUTES", "120"))
AVAILABILITY_STEP_MINUTES = int(os.getenv("AVAILABILITY_STEP_MINUTES", "30"))
OPEN_HOUR = int(os.getenv("OPEN_HOUR", "11"))
CLOSE_HOUR = int(os.getenv("CLOSE_HOUR", "22"))
MAX_COMBINED_TABLES = int(os.getenv("MAX_COMBINED_TABLES", "3"))
MAX_EXTRA_SEATS = int(os.getenv("MAX_EXTRA_SEATS", "2"))
WEEKDAY_NAMES = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


def parse_iso_dt(value):
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def combine_date_time(date_value, time_value):
    return datetime.fromisoformat(f"{date_value}T{time_value}:00")


def split_customer_name(customer_name):
    parts = (customer_name or "").strip().split(maxsplit=1)
    first_name = parts[0] if parts else ""
    last_name = parts[1] if len(parts) > 1 else ""
    return first_name, last_name


def build_customer_name(first_name=None, last_name=None, customer_name=None):
    if customer_name:
        return customer_name.strip()
    return " ".join(x for x in [first_name, last_name] if x and x.strip()).strip()


def reservation_window(reservation_time):
    start = reservation_time
    end = reservation_time + timedelta(minutes=SLOT_MINUTES)
    return start, end


def generate_confirmation_code():
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=8))


def default_open_time():
    return time(OPEN_HOUR, 0)


def default_close_time():
    return time(CLOSE_HOUR, 0)


def parse_time_value(value):
    if isinstance(value, time):
        return value
    if not value:
        return None
    return time.fromisoformat(value)


def ensure_weekly_schedule():
    existing = query_all("SELECT weekday FROM weekly_schedule")
    existing_days = {int(row["weekday"]) for row in existing}
    for weekday in range(7):
        if weekday in existing_days:
            continue
        execute(
            """
            INSERT INTO weekly_schedule (weekday, day_name, is_open, open_time, close_time)
            VALUES (%s, %s, TRUE, %s, %s)
            ON CONFLICT (weekday) DO NOTHING
            """,
            (weekday, WEEKDAY_NAMES[weekday], default_open_time(), default_close_time()),
        )


def serialize_schedule_row(row):
    return {
        "weekday": row["weekday"],
        "dayName": row["day_name"],
        "isOpen": row["is_open"],
        "openTime": row["open_time"].strftime("%H:%M") if row["open_time"] else None,
        "closeTime": row["close_time"].strftime("%H:%M") if row["close_time"] else None,
    }


def list_weekly_schedule():
    ensure_weekly_schedule()
    rows = query_all(
        """
        SELECT weekday, day_name, is_open, open_time, close_time
        FROM weekly_schedule
        ORDER BY weekday
        """
    )
    return [serialize_schedule_row(row) for row in rows]


def get_schedule_for_date(date_value):
    ensure_weekly_schedule()
    date_obj = (
        date_value.date()
        if isinstance(date_value, datetime)
        else datetime.strptime(date_value, "%Y-%m-%d").date()
    )
    row = query_one(
        """
        SELECT weekday, day_name, is_open, open_time, close_time
        FROM weekly_schedule
        WHERE weekday = %s
        """,
        (date_obj.weekday(),),
    )
    if row is None:
        return {
            "weekday": date_obj.weekday(),
            "dayName": WEEKDAY_NAMES[date_obj.weekday()],
            "isOpen": True,
            "openTime": default_open_time().strftime("%H:%M"),
            "closeTime": default_close_time().strftime("%H:%M"),
        }
    return serialize_schedule_row(row)


def update_schedule_day(weekday, is_open, open_time_value=None, close_time_value=None):
    weekday = int(weekday)
    if weekday < 0 or weekday > 6:
        raise ValueError("weekday must be between 0 and 6")

    ensure_weekly_schedule()
    open_time_parsed = parse_time_value(open_time_value) or default_open_time()
    close_time_parsed = parse_time_value(close_time_value) or default_close_time()
    if is_open and close_time_parsed <= open_time_parsed:
        raise ValueError("close_time must be later than open_time")

    row = execute_returning(
        """
        UPDATE weekly_schedule
        SET day_name = %s,
            is_open = %s,
            open_time = %s,
            close_time = %s
        WHERE weekday = %s
        RETURNING weekday, day_name, is_open, open_time, close_time
        """,
        (
            WEEKDAY_NAMES[weekday],
            bool(is_open),
            open_time_parsed,
            close_time_parsed,
            weekday,
        ),
    )
    return serialize_schedule_row(row)


def list_active_tables():
    return query_all(
        """
        SELECT id, name, capacity, can_unite, unite_with_table_id
        FROM tables
        WHERE is_active = TRUE
        ORDER BY LOWER(name), id
        """
    )


def list_table_blocks(date_value=None):
    sql = """
        SELECT id, table_id, start_time, end_time, reason, created_at
        FROM table_blocks
    """
    params = []
    if date_value:
        sql += " WHERE DATE(start_time) = %s"
        params.append(date_value)
    sql += " ORDER BY start_time ASC"
    return query_all(sql, tuple(params))


def serialize_table_block(row):
    return {
        "id": row["id"],
        "table_id": row["table_id"],
        "start_time": row["start_time"].isoformat(),
        "end_time": row["end_time"].isoformat(),
        "reason": row["reason"],
        "created_at": row["created_at"].isoformat(),
    }


def serialize_table(row, blocks=None):
    blocks = blocks or []
    active_block = blocks[0] if blocks else None
    return {
        "id": row["id"],
        "name": row["name"],
        "capacity": row["capacity"],
        "minCapacity": 1,
        "maxCapacity": row["capacity"],
        "isActive": row.get("is_active", True),
        "canUnite": row.get("can_unite", False),
        "uniteWithTableId": row.get("unite_with_table_id"),
        "isBlocked": active_block is not None,
        "blockedUntil": active_block["end_time"].isoformat() if active_block else None,
        "blockedReason": active_block["reason"] if active_block else None,
        "blocks": [serialize_table_block(block) for block in blocks],
    }


def tables_can_be_combined(combo):
    if len(combo) <= 1:
        return True
    if len(combo) != 2:
        return False

    first, second = combo
    return (
        bool(first.get("can_unite"))
        and bool(second.get("can_unite"))
        and first.get("unite_with_table_id") == second["id"]
        and second.get("unite_with_table_id") == first["id"]
    )


def combo_supports_party(combo, guests):
    return sum(table["capacity"] for table in combo) >= guests


def combo_overflow(combo, guests):
    return sum(table["capacity"] for table in combo) - guests


def combo_should_auto_confirm(combo, guests):
    return len(combo) == 1 and combo_overflow(combo, guests) <= MAX_EXTRA_SEATS


def get_table_conflict_details(table_ids, reservation_time, exclude_reservation_id=None):
    start, end = reservation_window(reservation_time)
    return query_one(
        """
        SELECT r.id, r.customer_name, r.phone, r.reservation_time
        FROM reservations r
        JOIN reservation_tables rt ON rt.reservation_id = r.id
        WHERE rt.table_id = ANY(%s::int[])
          AND r.status IN ('pending', 'confirmed')
          AND r.reservation_time < %s
          AND r.reservation_time + (%s || ' minutes')::interval > %s
          AND (%s IS NULL OR r.id <> %s)
        ORDER BY r.reservation_time
        LIMIT 1
        """,
        (
            list(table_ids),
            end,
            SLOT_MINUTES,
            start,
            exclude_reservation_id,
            exclude_reservation_id,
        ),
    )


def get_table_block_details(table_ids, reservation_time):
    start, end = reservation_window(reservation_time)
    return query_one(
        """
        SELECT tb.*
        FROM table_blocks tb
        WHERE tb.table_id = ANY(%s::int[])
          AND tb.start_time < %s
          AND tb.end_time > %s
        ORDER BY tb.start_time
        LIMIT 1
        """,
        (list(table_ids), end, start),
    )


def has_table_block_conflict(table_ids, reservation_time):
    return get_table_block_details(table_ids, reservation_time) is not None


def has_reservation_conflict(table_ids, reservation_time, exclude_reservation_id=None):
    return (
        get_table_conflict_details(table_ids, reservation_time, exclude_reservation_id)
        is not None
    )


def get_available_table_ids(reservation_time):
    free = []
    for table in list_active_tables():
        t_id = table["id"]
        if has_table_block_conflict([t_id], reservation_time):
            continue
        if has_reservation_conflict([t_id], reservation_time):
            continue
        free.append(table)
    return free


def pick_best_table_combo(guests, reservation_time):
    free_tables = get_available_table_ids(reservation_time)
    if not free_tables:
        return None

    best_combo = None
    for r in range(1, min(MAX_COMBINED_TABLES, len(free_tables)) + 1):
        for combo in itertools.combinations(free_tables, r):
            if not tables_can_be_combined(combo):
                continue
            capacity = sum(x["capacity"] for x in combo)
            overflow = capacity - guests
            if capacity < guests:
                continue
            score = (len(combo) > 1, overflow, len(combo), capacity)
            if best_combo is None or score < best_combo["score"]:
                best_combo = {
                    "score": score,
                    "table_ids": [x["id"] for x in combo],
                    "capacity": capacity,
                    "auto_confirm": combo_should_auto_confirm(combo, guests),
                }
    return best_combo


def validate_table_selection(table_ids, guests, reservation_time, exclude_reservation_id=None):
    selected_tables = query_all(
        """
        SELECT id, capacity, can_unite, unite_with_table_id
        FROM tables
        WHERE id = ANY(%s::int[]) AND is_active = TRUE
        """,
        (list(table_ids),),
    )
    if len(selected_tables) != len(table_ids):
        raise ValueError("One or more selected tables do not exist or are inactive")

    capacity = sum(t["capacity"] for t in selected_tables)
    has_capacity_issue = capacity < guests
    has_unite_issue = not tables_can_be_combined(selected_tables)
    conflict = get_table_conflict_details(
        table_ids, reservation_time, exclude_reservation_id=exclude_reservation_id
    )
    block = get_table_block_details(table_ids, reservation_time)
    return {
        "capacity_issue": has_capacity_issue,
        "unite_issue": has_unite_issue,
        "conflict": conflict,
        "block": block,
        "capacity": capacity,
        "auto_confirm": combo_should_auto_confirm(selected_tables, guests),
    }


def create_reservation(
    customer_name,
    guests,
    reservation_time,
    email=None,
    phone=None,
    sets=1,
    note=None,
    table_ids=None,
    created_by_admin=False,
    admin_note=None,
    force=False,
):
    if table_ids:
        issues = validate_table_selection(table_ids, guests, reservation_time)
        if (
            issues["capacity_issue"]
            or issues["unite_issue"]
            or issues["conflict"]
            or issues["block"]
        ) and not force:
            raise ValueError(
                "Selected tables require force=true due to capacity/conflict constraints"
            )
        assigned_table_ids = list(table_ids)
        status = "confirmed" if created_by_admin or issues["auto_confirm"] else "pending"
    else:
        combo = pick_best_table_combo(guests, reservation_time)
        if combo is None:
            raise ValueError("No available table combination for requested time and party size")
        assigned_table_ids = combo["table_ids"]
        status = "confirmed" if created_by_admin or combo["auto_confirm"] else "pending"

    reservation = execute_returning(
        """
        INSERT INTO reservations (
            customer_name, reservation_time, guests, sets, email, phone, note, status,
            confirmation_code, created_by_admin, admin_note, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        RETURNING *
        """,
        (
            customer_name,
            reservation_time,
            guests,
            sets,
            email,
            phone,
            note,
            status,
            generate_confirmation_code(),
            created_by_admin,
            admin_note,
        ),
    )

    for table_id in assigned_table_ids:
        execute(
            "INSERT INTO reservation_tables (reservation_id, table_id) VALUES (%s, %s)",
            (reservation["id"], table_id),
        )
    return get_reservation(reservation["id"])


def reservation_payload(row):
    if row is None:
        return None

    table_ids = [int(x) for x in row["table_ids"].split(",")] if row.get("table_ids") else []
    first_name, last_name = split_customer_name(row["customer_name"])
    reservation_time = row["reservation_time"]
    end_time = reservation_time + timedelta(minutes=SLOT_MINUTES)

    return {
        "id": str(row["id"]),
        "customer_name": row["customer_name"],
        "firstName": first_name,
        "lastName": last_name,
        "reservation_time": reservation_time.isoformat(),
        "date": reservation_time.date().isoformat(),
        "time": reservation_time.strftime("%H:%M"),
        "endTime": end_time.strftime("%H:%M"),
        "guests": row["guests"],
        "sets": row.get("sets", 1),
        "email": row["email"],
        "phone": row["phone"],
        "note": row.get("note"),
        "status": row["status"],
        "confirmation_code": row["confirmation_code"],
        "created_by_admin": row["created_by_admin"],
        "admin_note": row["admin_note"],
        "cancelled_at": row["cancelled_at"].isoformat() if row["cancelled_at"] else None,
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
        "table_ids": table_ids,
        "tableId": table_ids[0] if table_ids else None,
        "color": "bg-green-100 border-l-green-400" if row["status"] == "confirmed" else "bg-yellow-100 border-l-yellow-400",
    }


def get_reservation(reservation_id):
    row = query_one(
        """
        SELECT r.*, STRING_AGG(rt.table_id::text, ',' ORDER BY rt.table_id) AS table_ids
        FROM reservations r
        LEFT JOIN reservation_tables rt ON rt.reservation_id = r.id
        WHERE r.id = %s
        GROUP BY r.id
        """,
        (reservation_id,),
    )
    return reservation_payload(row)


def get_slots_for_day(date_value, guests):
    date_obj = datetime.strptime(date_value, "%Y-%m-%d").date()
    schedule = get_schedule_for_date(date_value)
    if not schedule["isOpen"] or not schedule["openTime"] or not schedule["closeTime"]:
        return {"schedule": schedule, "slots": []}

    open_time_value = parse_time_value(schedule["openTime"])
    close_time_value = parse_time_value(schedule["closeTime"])
    slots = []
    hour = open_time_value.hour
    minute = open_time_value.minute
    while True:
        slot_time = datetime.combine(date_obj, time(hour, minute))
        if slot_time.time() > close_time_value:
            break
        combo = pick_best_table_combo(guests, slot_time)
        slots.append(
            {
                "reservation_time": slot_time.isoformat(),
                "time": slot_time.strftime("%H:%M"),
                "available": combo is not None,
                "suggested_table_ids": combo["table_ids"] if combo else [],
                "confirmation_mode": "automatic" if combo and combo["auto_confirm"] else ("manual" if combo else None),
            }
        )
        minute += AVAILABILITY_STEP_MINUTES
        while minute >= 60:
            hour += 1
            minute -= 60
    return {"schedule": schedule, "slots": slots}


def update_reservation(reservation_id, updates, force=False):
    current = get_reservation(reservation_id)
    if not current:
        return None
    if current["status"] == "cancelled":
        raise ValueError("Cancelled reservations cannot be edited")

    new_name = build_customer_name(
        first_name=updates.get("firstName", current["firstName"]),
        last_name=updates.get("lastName", current["lastName"]),
        customer_name=updates.get("customer_name"),
    )
    if not new_name:
        raise ValueError("Customer name is required")

    if "reservation_time" in updates:
        new_time = parse_iso_dt(updates["reservation_time"])
    elif "date" in updates and "time" in updates:
        new_time = combine_date_time(updates["date"], updates["time"])
    else:
        new_time = parse_iso_dt(current["reservation_time"])

    new_guests = int(updates.get("guests", current["guests"]))
    new_sets = int(updates.get("sets", current["sets"]))
    new_email = updates.get("email", current["email"])
    new_phone = updates.get("phone", current["phone"])
    new_note = updates.get("note", current["note"])
    new_admin_note = updates.get("admin_note", current["admin_note"])
    new_table_ids = updates.get("table_ids") or ([updates["tableId"]] if updates.get("tableId") else current["table_ids"])

    issues = validate_table_selection(
        new_table_ids, new_guests, new_time, exclude_reservation_id=int(reservation_id)
    )
    if (
        issues["capacity_issue"]
        or issues["unite_issue"]
        or issues["conflict"]
        or issues["block"]
    ) and not force:
        raise ValueError("Update requires force=true due to capacity/conflict constraints")

    execute(
        """
        UPDATE reservations
        SET customer_name = %s,
            reservation_time = %s,
            guests = %s,
            sets = %s,
            email = %s,
            phone = %s,
            note = %s,
            admin_note = %s,
            updated_at = NOW()
        WHERE id = %s
        """,
        (
            new_name,
            new_time,
            new_guests,
            new_sets,
            new_email,
            new_phone,
            new_note,
            new_admin_note,
            reservation_id,
        ),
    )
    execute("DELETE FROM reservation_tables WHERE reservation_id = %s", (reservation_id,))
    for table_id in new_table_ids:
        execute(
            "INSERT INTO reservation_tables (reservation_id, table_id) VALUES (%s, %s)",
            (reservation_id, table_id),
        )
    return get_reservation(reservation_id)


def confirm_reservation(reservation_id, code):
    row = execute_returning(
        """
        UPDATE reservations
        SET status = 'confirmed', updated_at = NOW()
        WHERE id = %s
          AND status <> 'cancelled'
          AND confirmation_code = %s
        RETURNING id
        """,
        (reservation_id, code),
    )
    return row is not None


def admin_confirm_reservation(reservation_id):
    return execute_returning(
        """
        UPDATE reservations
        SET status = 'confirmed', updated_at = NOW()
        WHERE id = %s
          AND status = 'pending'
        RETURNING id
        """,
        (reservation_id,),
    )


def cancel_reservation(reservation_id, reason=None):
    return execute_returning(
        """
        UPDATE reservations
        SET status = 'cancelled',
            cancelled_at = NOW(),
            admin_note = COALESCE(%s, admin_note),
            updated_at = NOW()
        WHERE id = %s
        RETURNING id
        """,
        (reason, reservation_id),
    )


def restore_cancelled_reservation(reservation_id):
    return execute_returning(
        """
        UPDATE reservations
        SET status = 'pending',
            cancelled_at = NULL,
            updated_at = NOW()
        WHERE id = %s
          AND status = 'cancelled'
        RETURNING id
        """,
        (reservation_id,),
    )


def delete_cancelled_reservation(reservation_id):
    reservation = query_one(
        "SELECT id FROM reservations WHERE id = %s AND status = 'cancelled'",
        (reservation_id,),
    )
    if not reservation:
        return None
    execute("DELETE FROM reservations WHERE id = %s", (reservation_id,))
    return reservation


def list_reservations(filters):
    conditions = []
    params = []
    if filters.get("status"):
        conditions.append("r.status = %s")
        params.append(filters["status"])
    if filters.get("from"):
        conditions.append("r.reservation_time >= %s")
        params.append(parse_iso_dt(filters["from"]))
    if filters.get("to"):
        conditions.append("r.reservation_time <= %s")
        params.append(parse_iso_dt(filters["to"]))
    if filters.get("date"):
        conditions.append("DATE(r.reservation_time) = %s")
        params.append(filters["date"])
    if filters.get("q"):
        conditions.append(
            "(LOWER(r.customer_name) LIKE %s OR LOWER(COALESCE(r.email, '')) LIKE %s OR COALESCE(r.phone, '') LIKE %s OR r.id::text LIKE %s)"
        )
        q = f"%{filters['q'].lower()}%"
        params.extend([q, q, f"%{filters['q']}%", f"%{filters['q']}%"])

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = query_all(
        f"""
        SELECT r.*, STRING_AGG(rt.table_id::text, ',' ORDER BY rt.table_id) AS table_ids
        FROM reservations r
        LEFT JOIN reservation_tables rt ON rt.reservation_id = r.id
        {where_clause}
        GROUP BY r.id
        ORDER BY r.reservation_time ASC
        """,
        tuple(params),
    )
    return [reservation_payload(row) for row in rows]


def reservations_analytics(filters):
    rows = list_reservations(filters)
    by_status = {}
    by_guests = {}
    total_sets = 0
    for row in rows:
        by_status[row["status"]] = by_status.get(row["status"], 0) + 1
        by_guests[row["guests"]] = by_guests.get(row["guests"], 0) + 1
        total_sets += int(row["sets"])
    return {
        "total": len(rows),
        "total_sets": total_sets,
        "by_status": by_status,
        "by_guests": by_guests,
        "rows": rows,
    }


def analytics_to_csv(analytics):
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["metric", "key", "value"])
    writer.writerow(["total", "", analytics["total"]])
    writer.writerow(["total_sets", "", analytics["total_sets"]])
    for key, value in sorted(analytics["by_status"].items()):
        writer.writerow(["by_status", key, value])
    for key, value in sorted(analytics["by_guests"].items()):
        writer.writerow(["by_guests", key, value])
    return out.getvalue()
