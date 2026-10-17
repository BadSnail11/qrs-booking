import os
from contextlib import contextmanager

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


@contextmanager
def advisory_lock(namespace, key):
    """Hold a Postgres session-level advisory lock on a dedicated connection.

    Other connections still see each committed write, so code inside can keep
    using query_*/execute; the lock is released on exit or if the process dies.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_lock(%s, %s)", (namespace, key))
        conn.commit()
        yield
    finally:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_unlock(%s, %s)", (namespace, key))
            conn.commit()
        finally:
            conn.close()
