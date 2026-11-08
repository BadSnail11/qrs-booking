"""Read-only audit of reservation data: table/time conflicts and other inconsistencies.

Run on the server:
    docker compose exec admin-app python audit_reservations.py          # upcoming only
    docker compose exec admin-app python audit_reservations.py --all    # whole history

Only SELECT queries are executed; nothing is changed.
"""

import argparse
import sys
from datetime import timedelta

from booking_service import (
    FIXED_SLOT_PERIODS,
    RESTAURANT_TZ,
    SLOT_MINUTES,
    in_fixed_slot_period,
    reservation_end,
    reservation_end_sql,
)
from db import query_all, query_one
from phone_utils import phone_validation_error

ACTIVE = ("pending", "confirmed")


def fmt(dt):
    return dt.strftime("%d.%m.%Y %H:%M")


def who(r):
    return f"#{r['id']} {r['customer_name'] or '-'} ({r['status']}, {r['guests']} гост.)"


class Report:
    def __init__(self):
        self.sections = []

    def section(self, title, rows, render, level="ОШИБКА"):
        self.sections.append((title, rows, render, level))

    def print(self):
        problems = 0
        for title, rows, render, level in self.sections:
            mark = "OK " if not rows else ("!! " if level == "ОШИБКА" else "?  ")
            print(f"\n{mark}{title}: {len(rows)}")
            for row in rows[:200]:
                print("    " + render(row))
            if len(rows) > 200:
                print(f"    … и ещё {len(rows) - 200}")
            if rows and level == "ОШИБКА":
                problems += len(rows)
        return problems


def audit_restaurant(rid, slug, scope_sql, report):
    end_r = reservation_end_sql("r")
    end_o = reservation_end_sql("o")

    overlaps = query_all(
        f"""
        SELECT r.id, r.customer_name, r.status, r.guests, r.reservation_time, r.duration_minutes,
               o.id AS o_id, o.customer_name AS o_name, o.status AS o_status, o.guests AS o_guests,
               o.reservation_time AS o_time, o.duration_minutes AS o_duration,
               t.name AS table_name
        FROM reservations r
        JOIN reservation_tables rt ON rt.reservation_id = r.id
        JOIN reservation_tables ot ON ot.table_id = rt.table_id AND ot.reservation_id > r.id
        JOIN reservations o ON o.id = ot.reservation_id
        JOIN tables t ON t.id = rt.table_id
        WHERE r.restaurant_id = %s AND o.restaurant_id = %s
          AND r.status IN ('pending', 'confirmed') AND o.status IN ('pending', 'confirmed')
          AND r.reservation_time < {end_o} AND o.reservation_time < {end_r}
          AND {scope_sql.format(a="r")}
        ORDER BY r.reservation_time, t.name
        """,
        (rid, rid, RESTAURANT_TZ),
    )

    def render_overlap(x):
        a_end = reservation_end(x["reservation_time"], x["duration_minutes"])
        b_end = reservation_end(x["o_time"], x["o_duration"])
        return (
            f"стол «{x['table_name']}»: #{x['id']} {x['customer_name']} "
            f"{fmt(x['reservation_time'])}–{a_end:%H:%M} ({x['status']})  ⟷  "
            f"#{x['o_id']} {x['o_name']} {fmt(x['o_time'])}–{b_end:%H:%M} ({x['o_status']})"
        )

    def strict_overlap(x):
        slot = timedelta(minutes=SLOT_MINUTES)
        return x["reservation_time"] < x["o_time"] + slot and x["o_time"] < x["reservation_time"] + slot

    report.section(
        f"[{slug}] Двойные брони: один стол, пересекаются даже по 2 часа",
        [x for x in overlaps if strict_overlap(x)],
        render_overlap,
    )
    report.section(
        f"[{slug}] Вечерние брони «встык»: по 2 часа не пересекаются, но первая теперь без ограничения "
        "по времени — первого гостя нужно предупредить, что стол занят с начала следующей брони",
        [x for x in overlaps if not strict_overlap(x)],
        render_overlap,
        level="ВНИМАНИЕ",
    )

    exact_dupes = query_all(
        f"""
        SELECT r.id, r.customer_name, r.status, r.guests, r.reservation_time, r.phone,
               array_agg(o.id ORDER BY o.id) AS others
        FROM reservations r
        JOIN reservations o ON o.restaurant_id = r.restaurant_id AND o.id > r.id
             AND o.reservation_time = r.reservation_time
             AND regexp_replace(COALESCE(o.phone, ''), '\\D', '', 'g') = regexp_replace(COALESCE(r.phone, ''), '\\D', '', 'g')
             AND COALESCE(r.phone, '') <> ''
             AND o.status IN ('pending', 'confirmed')
        WHERE r.restaurant_id = %s AND r.status IN ('pending', 'confirmed') AND {scope_sql.format(a="r")}
        GROUP BY r.id
        ORDER BY r.reservation_time
        """,
        (rid, RESTAURANT_TZ),
    )
    report.section(
        f"[{slug}] Дубли: один телефон, одно время, несколько активных броней",
        exact_dupes,
        lambda x: f"{who(x)} {fmt(x['reservation_time'])} тел. {x['phone']} — дубли: "
        + ", ".join(f"#{i}" for i in x["others"]),
    )

    no_tables = query_all(
        f"""
        SELECT r.id, r.customer_name, r.status, r.guests, r.reservation_time
        FROM reservations r
        WHERE r.restaurant_id = %s AND r.status IN ('pending', 'confirmed') AND {scope_sql.format(a="r")}
          AND NOT EXISTS (SELECT 1 FROM reservation_tables rt WHERE rt.reservation_id = r.id)
        ORDER BY r.reservation_time
        """,
        (rid, RESTAURANT_TZ),
    )
    report.section(
        f"[{slug}] Активные брони без стола",
        no_tables,
        lambda x: f"{who(x)} {fmt(x['reservation_time'])}",
    )

    bad_tables = query_all(
        f"""
        SELECT r.id, r.customer_name, r.status, r.guests, r.reservation_time, t.name AS table_name,
               t.is_active, t.restaurant_id AS table_restaurant
        FROM reservations r
        JOIN reservation_tables rt ON rt.reservation_id = r.id
        JOIN tables t ON t.id = rt.table_id
        WHERE r.restaurant_id = %s AND r.status IN ('pending', 'confirmed') AND {scope_sql.format(a="r")}
          AND (t.is_active = FALSE OR t.restaurant_id <> r.restaurant_id)
        ORDER BY r.reservation_time
        """,
        (rid, RESTAURANT_TZ),
    )
    report.section(
        f"[{slug}] Брони на отключённом столе или столе другого ресторана",
        bad_tables,
        lambda x: f"{who(x)} {fmt(x['reservation_time'])} стол «{x['table_name']}» "
        + ("(отключён)" if not x["is_active"] else f"(ресторан {x['table_restaurant']})"),
    )

    blocked = query_all(
        f"""
        SELECT r.id, r.customer_name, r.status, r.guests, r.reservation_time, t.name AS table_name,
               tb.start_time, tb.end_time, tb.reason
        FROM reservations r
        JOIN reservation_tables rt ON rt.reservation_id = r.id
        JOIN tables t ON t.id = rt.table_id
        JOIN table_blocks tb ON tb.table_id = rt.table_id
        WHERE r.restaurant_id = %s AND r.status IN ('pending', 'confirmed') AND {scope_sql.format(a="r")}
          AND tb.start_time < {end_r} AND tb.end_time > r.reservation_time
        ORDER BY r.reservation_time
        """,
        (rid, RESTAURANT_TZ),
    )
    report.section(
        f"[{slug}] Брони на заблокированном столе",
        blocked,
        lambda x: f"{who(x)} {fmt(x['reservation_time'])} стол «{x['table_name']}» заблокирован "
        f"{fmt(x['start_time'])}–{x['end_time']:%H:%M} ({x['reason'] or 'без причины'})",
    )

    capacity = query_all(
        f"""
        SELECT r.id, r.customer_name, r.status, r.guests, r.reservation_time,
               SUM(t.capacity) AS capacity, string_agg(t.name, ' + ' ORDER BY t.name) AS table_names
        FROM reservations r
        JOIN reservation_tables rt ON rt.reservation_id = r.id
        JOIN tables t ON t.id = rt.table_id
        WHERE r.restaurant_id = %s AND r.status IN ('pending', 'confirmed') AND {scope_sql.format(a="r")}
        GROUP BY r.id
        HAVING SUM(t.capacity) < r.guests
        ORDER BY r.reservation_time
        """,
        (rid, RESTAURANT_TZ),
    )
    report.section(
        f"[{slug}] Гостей больше, чем мест за столом",
        capacity,
        lambda x: f"{who(x)} {fmt(x['reservation_time'])} «{x['table_names']}» мест {x['capacity']}",
        level="ВНИМАНИЕ",
    )

    if query_one("SELECT to_regclass('online_guest_limits') IS NOT NULL AS ok")["ok"]:
        over_limit = query_all(
            f"""
            SELECT r.id, r.customer_name, r.status, r.guests, r.reservation_time, l.max_guests
            FROM reservations r
            JOIN online_guest_limits l ON l.restaurant_id = r.restaurant_id
                 AND l.limit_date = r.reservation_time::date
            WHERE r.restaurant_id = %s AND r.status IN ('pending', 'confirmed')
              AND r.created_by_admin = FALSE AND r.guests > l.max_guests AND {scope_sql.format(a="r")}
            ORDER BY r.reservation_time
            """,
            (rid, RESTAURANT_TZ),
        )
        report.section(
            f"[{slug}] Онлайн-брони сверх лимита гостей на дату",
            over_limit,
            lambda x: f"{who(x)} {fmt(x['reservation_time'])} (лимит {x['max_guests']})",
            level="ВНИМАНИЕ",
        )

    future = query_all(
        """
        SELECT r.id, r.customer_name, r.status, r.guests, r.reservation_time, r.phone,
               r.iiko_reserve_id, r.iiko_creation_status
        FROM reservations r
        WHERE r.restaurant_id = %s AND r.status IN ('pending', 'confirmed')
          AND r.reservation_time > (timezone(%s, now()))::timestamp
        ORDER BY r.reservation_time
        """,
        (rid, RESTAURANT_TZ),
    )
    bad_phones = [r for r in future if r["phone"] and phone_validation_error(r["phone"])]
    report.section(
        f"[{slug}] Будущие брони с номером, на который не уйдёт SMS",
        bad_phones,
        lambda x: f"{who(x)} {fmt(x['reservation_time'])} тел. «{x['phone']}»: {phone_validation_error(x['phone'])}",
        level="ВНИМАНИЕ",
    )

    iiko_configured = query_one(
        "SELECT iiko_api_login IS NOT NULL AS ok FROM restaurants WHERE id = %s", (rid,)
    )["ok"]
    if iiko_configured:
        unsynced = [r for r in future if r["status"] == "confirmed" and not r["iiko_reserve_id"]]
        report.section(
            f"[{slug}] Подтверждённые будущие брони, которых нет в iiko",
            unsynced,
            lambda x: f"{who(x)} {fmt(x['reservation_time'])} статус iiko: {x['iiko_creation_status'] or 'не отправлялась'}",
            level="ВНИМАНИЕ",
        )
        long_in_iiko = [
            r for r in future
            if r["iiko_reserve_id"] and in_fixed_slot_period(r["reservation_time"])
            and (r["reservation_time"].hour >= 17 or r["reservation_time"].hour < 6)
        ]
        report.section(
            f"[{slug}] Вечерние брони в период строгих 2 ч, уже ушедшие в iiko (проверьте длительность на кассе)",
            long_in_iiko,
            lambda x: f"{who(x)} {fmt(x['reservation_time'])}",
            level="ВНИМАНИЕ",
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--all", action="store_true", help="check the whole history, not only upcoming reservations")
    parser.add_argument("--restaurant", help="restaurant slug (default: all)")
    args = parser.parse_args()

    # reservations that end after now (still matter), or everything with --all
    scope_sql = "TRUE" if args.all else "{a}.reservation_time > (timezone(%s, now()))::timestamp - interval '1 day'"
    if args.all:
        scope_sql = "(TRUE OR %s IS NULL)"

    restaurants = query_all(
        "SELECT id, slug FROM restaurants WHERE (%s::text IS NULL OR slug = %s) ORDER BY id",
        (args.restaurant, args.restaurant),
    )
    if not restaurants:
        print("Рестораны не найдены")
        return 2

    counts = query_one(
        """
        SELECT COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed')) AS active,
               COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed')
                                AND reservation_time > (timezone(%s, now()))::timestamp) AS upcoming,
               MIN(reservation_time) AS first, MAX(reservation_time) AS last
        FROM reservations
        """,
        (RESTAURANT_TZ,),
    )
    print("Аудит броней" + (" (вся история)" if args.all else " (с вчерашнего дня и вперёд)"))
    print(
        f"Активных броней: {counts['active']}, из них будущих: {counts['upcoming']}; "
        f"в базе с {fmt(counts['first']) if counts['first'] else '-'} по {fmt(counts['last']) if counts['last'] else '-'}"
    )
    if FIXED_SLOT_PERIODS:
        print("Периоды строгих 2 ч: " + ", ".join(f"{a:%d.%m}–{b:%d.%m.%Y}" for a, b in FIXED_SLOT_PERIODS))

    report = Report()
    for r in restaurants:
        audit_restaurant(int(r["id"]), r["slug"], scope_sql, report)
    problems = report.print()
    print(
        "\nИтог: " + ("ошибок нет" if problems == 0 else f"найдено ошибок: {problems}")
        + " (строки «?» — на проверку, не обязательно ошибки)"
    )
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
