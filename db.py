import os

import psycopg2
from psycopg2.extras import RealDictCursor


def get_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "postgres"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "qrs_booking"),
        user=os.getenv("DB_USER", "qrs_user"),
        password=os.getenv("DB_PASSWORD", "qrs_pass"),
    )


def query_all(sql, params=None):
    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return cur.fetchall()


def query_one(sql, params=None):
    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return cur.fetchone()


def execute(sql, params=None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())


def execute_returning(sql, params=None):
    """INSERT/UPDATE ... RETURNING — returns one row as dict."""
    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return cur.fetchone()


def find_reservation_slot_conflict(table_ids, reservation_time, exclude_reservation_id=None):
    """If any of the tables is already used by another reservation in the same ~1h window, return that row."""
    if not table_ids:
        return None
    return query_one(
        """
        SELECT r.id
        FROM reservations r
        JOIN reservation_tables rt ON rt.reservation_id = r.id
        WHERE rt.table_id = ANY(%s::int[])
          AND r.reservation_time >= %s::timestamp - interval '59 minutes'
          AND r.reservation_time <= %s::timestamp + interval '59 minutes'
          AND (%s IS NULL OR r.id <> %s)
        LIMIT 1
        """,
        (
            list(table_ids),
            reservation_time,
            reservation_time,
            exclude_reservation_id,
            exclude_reservation_id,
        ),
    )
