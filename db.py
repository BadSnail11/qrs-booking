import os
import threading
from contextlib import contextmanager

import psycopg2
from psycopg2 import pool as pg_pool
from psycopg2.extras import RealDictCursor

_pool = None
_pool_slots = None
_pool_lock = threading.Lock()


def _connect_kwargs():
    """DATABASE_URL (e.g. Supabase) wins over the DB_* variables.

    Supabase: use the direct connection or the *session* pooler (port 5432).
    The transaction pooler (port 6543) is not supported: reservation_lock()
    relies on session-level advisory locks.
    """
    url = os.getenv("DATABASE_URL", "").strip()
    if url:
        kwargs = {"dsn": url}
    else:
        kwargs = {
            "host": os.getenv("DB_HOST", "postgres"),
            "port": os.getenv("DB_PORT", "5432"),
            "dbname": os.getenv("DB_NAME", "qrs_booking"),
            "user": os.getenv("DB_USER", "qrs_user"),
            "password": os.getenv("DB_PASSWORD", "qrs_pass"),
        }
    sslmode = os.getenv("DB_SSLMODE", "").strip()
    if sslmode:
        kwargs["sslmode"] = sslmode
    kwargs["connect_timeout"] = int(os.getenv("DB_CONNECT_TIMEOUT", "10"))
    return kwargs


def get_connection():
    """A fresh, unpooled connection the caller owns and must close."""
    return psycopg2.connect(**_connect_kwargs())


def _get_pool():
    global _pool, _pool_slots
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                size = int(os.getenv("DB_POOL_MAX", "10"))
                # psycopg2 raises instead of waiting when the pool is exhausted
                _pool_slots = threading.BoundedSemaphore(size)
                _pool = pg_pool.ThreadedConnectionPool(1, size, **_connect_kwargs())
    return _pool


def _run(sql, params, fetch, cursor_factory=RealDictCursor):
    """Run one statement on a pooled connection and commit.

    Every statement used to open its own connection; against a remote database
    (Supabase) that adds a TCP+TLS handshake per query. A connection the server
    dropped (idle timeout, restart) is discarded and the statement retried once;
    the dropped transaction was rolled back server-side, so the retry is safe.
    """
    p = _get_pool()
    for attempt in (1, 2):
        _pool_slots.acquire()
        conn = p.getconn()
        try:
            with conn.cursor(cursor_factory=cursor_factory) as cur:
                cur.execute(sql, params or ())
                result = fetch(cur)
            conn.commit()
            return result
        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            if attempt == 2 or not conn.closed:
                if not conn.closed:
                    conn.rollback()
                raise
        except Exception:
            if not conn.closed:
                conn.rollback()
            raise
        finally:
            p.putconn(conn, close=bool(conn.closed))
            _pool_slots.release()


def query_all(sql, params=None):
    return _run(sql, params, lambda cur: cur.fetchall())


def query_one(sql, params=None):
    return _run(sql, params, lambda cur: cur.fetchone())


def execute(sql, params=None):
    _run(sql, params, lambda cur: None, cursor_factory=None)


def execute_returning(sql, params=None):
    """INSERT/UPDATE ... RETURNING — returns one row as dict."""
    return _run(sql, params, lambda cur: cur.fetchone())


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
