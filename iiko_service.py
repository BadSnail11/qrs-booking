"""iiko Cloud API client for reserve management."""

import logging
import os
import time
import json

import requests

from db import execute, query_one, query_all

logger = logging.getLogger(__name__)

IIKO_API_BASE = "https://api-ru.iiko.services"

RESERVE_CREATE_PATH = "/api/1/reserve/create"
# iiko auto-blocks the apiLogin above 20% of 400s on reserve/create per 24h;
# keep a margin below it
CREATE_MAX_ERROR_RATIO = float(os.getenv("IIKO_CREATE_MAX_ERROR_RATIO", "0.15"))

_request_log_ready = False


class IikoCreatePaused(RuntimeError):
    """reserve/create withheld locally: one more 400 could cross iiko's block threshold.

    Transient — the reservation stays 'Error' and the sync worker retries it once
    old failures age out of the 24h window.
    """


def _ensure_request_log():
    global _request_log_ready
    if _request_log_ready:
        return
    execute(
        """
        CREATE TABLE IF NOT EXISTS iiko_request_log (
            id BIGSERIAL PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            path TEXT NOT NULL,
            status_code INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_iiko_request_log_path_created
            ON iiko_request_log (path, created_at);
        """
    )
    _request_log_ready = True


def _log_request(path: str, status_code: int) -> None:
    try:
        _ensure_request_log()
        execute(
            "INSERT INTO iiko_request_log (path, status_code) VALUES (%s, %s)",
            (path, status_code),
        )
    except Exception as e:
        logger.error("Failed to record iiko request log: %s", e)


def create_request_stats_24h() -> dict:
    """reserve/create totals for the last 24h, as iiko counts them for auto-block."""
    _ensure_request_log()
    row = query_one(
        """
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status_code = 400) AS bad_requests
        FROM iiko_request_log
        WHERE path = %s AND created_at > NOW() - INTERVAL '24 hours'
        """,
        (RESERVE_CREATE_PATH,),
    )
    total = int(row["total"]) if row else 0
    bad = int(row["bad_requests"]) if row else 0
    return {
        "total": total,
        "bad_requests": bad,
        # Worst case: the next request fails too
        "paused": bad > 0 and (bad + 1) / (total + 1) > CREATE_MAX_ERROR_RATIO,
    }


class IikoBadRequest(RuntimeError):
    """Permanent client error (HTTP 400): the same request will never succeed.

    Callers must NOT auto-retry these — iiko auto-blocks the apiLogin when >20%
    of reserve/create requests return 400 within 24h. Auth/5xx problems stay
    plain RuntimeError (transient: retrying them is fine).
    """

# In-memory token cache: {api_login: (token, expires_at)}
_token_cache: dict[str, tuple[str, float]] = {}


# ── Auth ─────────────────────────────────────────────────────────────────


def _get_token(api_login: str) -> str:
    """Get a valid access token, using cache if not expired."""
    cached = _token_cache.get(api_login)
    if cached:
        token, expires_at = cached
        if time.time() < expires_at - 60:  # refresh 1 min early
            return token

    try:
        data = _api_post("/api/1/access_token", {"apiLogin": api_login}, auth=False)
    except IikoBadRequest as e:
        # Auth failures (e.g. blocked apiLogin) affect the whole login, not one
        # request — never mark individual reservations as rejected because of them.
        raise RuntimeError(str(e)) from e
    token = data.get("token")
    if not token:
        error_desc = data.get("errorDescription") or str(data)
        logger.error("iiko auth failed for apiLogin %s...: %s", api_login[:6], error_desc)
        raise RuntimeError(f"iiko auth failed: {error_desc}")
    _token_cache[api_login] = (token, time.time() + 3500)  # ~58 min
    return token


def _get_restaurant_iiko_config(restaurant_id: int) -> dict | None:
    """Load iiko config for a restaurant from DB."""
    row = query_one(
        """
        SELECT iiko_api_login, iiko_organization_id::text, iiko_terminal_group_id::text
        FROM restaurants WHERE id = %s
        """,
        (restaurant_id,),
    )
    if not row or not row["iiko_api_login"]:
        return None
    return row


# ── HTTP helper ──────────────────────────────────────────────────────────


def _api_post(path: str, body: dict, auth: bool = True, token: str | None = None) -> dict:
    """POST JSON to iiko API and return parsed response."""
    url = IIKO_API_BASE + path
    headers = {"Content-Type": "application/json"}
    if auth and token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        resp = requests.post(url, json=body, headers=headers, timeout=30)
    except requests.RequestException as e:
        logger.error("iiko API %s connection error: %s", path, e)
        raise RuntimeError(f"iiko API connection error: {e}") from e

    if path == RESERVE_CREATE_PATH:
        _log_request(path, resp.status_code)

    try:
        data = resp.json()
    except (json.JSONDecodeError, ValueError):
        if not resp.ok:
            if resp.status_code == 400:
                raise IikoBadRequest(f"iiko API {path} error 400: {resp.text}")
            raise RuntimeError(f"iiko API error {resp.status_code}: {resp.text}")
        return {}

    if not resp.ok:
        logger.error("iiko API %s returned %s: %s", path, resp.status_code, data)
        if resp.status_code == 400:
            error_desc = data.get("errorDescription") or str(data)
            raise IikoBadRequest(f"iiko API {path} error 400: {error_desc}")

    return data


def _authed_post(api_login: str, path: str, body: dict) -> dict:
    """POST with auto-refreshing auth token."""
    token = _get_token(api_login)
    return _api_post(path, body, token=token)


# ── Public API ───────────────────────────────────────────────────────────


def is_terminal_alive(restaurant_id: int) -> bool:
    """Check if the iiko terminal is online."""
    config = _get_restaurant_iiko_config(restaurant_id)
    if not config:
        return False
    data = _authed_post(config["iiko_api_login"], "/api/1/terminal_groups/is_alive", {
        "organizationIds": [config["iiko_organization_id"]],
        "terminalGroupIds": [config["iiko_terminal_group_id"]],
    })
    for status in data.get("isAliveStatus", []):
        if status.get("terminalGroupId") == config["iiko_terminal_group_id"]:
            return status.get("isAlive", False)
    return False


def get_iiko_table_ids(table_ids: list[int]) -> list[str]:
    """Convert local table IDs to iiko UUIDs. Returns only mapped tables."""
    if not table_ids:
        return []
    rows = query_all(
        "SELECT iiko_table_id::text FROM tables WHERE id = ANY(%s::int[]) AND iiko_table_id IS NOT NULL",
        (list(table_ids),),
    )
    return [r["iiko_table_id"] for r in rows]


def get_local_table_ids(iiko_table_ids: list[str]) -> list[int]:
    """Convert iiko table UUIDs to local table IDs."""
    if not iiko_table_ids:
        return []
    rows = query_all(
        "SELECT id FROM tables WHERE iiko_table_id::text = ANY(%s::text[])",
        (list(iiko_table_ids),),
    )
    return [r["id"] for r in rows]


def get_reserves_workload(restaurant_id: int, date_from: str, date_to: str) -> list[dict]:
    """Fetch existing reserves from iiko for given date range.

    date_from/date_to: ISO format like '2026-05-28T00:00:00.000'
    """
    config = _get_restaurant_iiko_config(restaurant_id)
    if not config:
        return []

    section_rows = query_all(
        "SELECT DISTINCT iiko_section_id::text FROM tables WHERE restaurant_id = %s AND iiko_section_id IS NOT NULL",
        (restaurant_id,),
    )
    section_ids = [r["iiko_section_id"] for r in section_rows]
    if not section_ids:
        return []

    data = _authed_post(config["iiko_api_login"], "/api/1/reserve/restaurant_sections_workload", {
        "restaurantSectionIds": section_ids,
        "dateFrom": date_from,
        "dateTo": date_to,
    })
    return data.get("reserves", [])


def get_reserve_status(restaurant_id: int, iiko_reserve_id: str) -> dict | None:
    """Get full reserve detail from iiko by reserve ID."""
    config = _get_restaurant_iiko_config(restaurant_id)
    if not config:
        return None

    data = _authed_post(config["iiko_api_login"], "/api/1/reserve/status_by_id", {
        "organizationId": config["iiko_organization_id"],
        "reserveIds": [iiko_reserve_id],
    })
    reserves = data.get("reserves", [])
    return reserves[0] if reserves else None


def create_reserve(
    restaurant_id: int,
    *,
    customer_name: str,
    customer_surname: str | None = None,
    phone: str,
    guests_count: int,
    table_ids: list[int],
    estimated_start_time: str,
    duration_minutes: int = 120,
    comment: str = "",
) -> dict:
    """Create a reserve in iiko. Returns the reserveInfo dict.

    estimated_start_time: ISO format like '2026-05-28T19:00:00.000'
    table_ids: local (integer) table IDs — will be converted to iiko UUIDs.

    Raises RuntimeError if iiko is unavailable or returns an error.
    """
    config = _get_restaurant_iiko_config(restaurant_id)
    if not config:
        raise RuntimeError("iiko is not configured for this restaurant")

    iiko_table_ids = get_iiko_table_ids(table_ids)
    if not iiko_table_ids:
        raise RuntimeError("No iiko table mapping found for the selected tables")

    try:
        stats = create_request_stats_24h()
    except Exception as e:
        logger.error("iiko request stats unavailable, not sending reserve/create: %s", e)
        raise RuntimeError(f"iiko request stats unavailable: {e}") from e
    if stats["paused"]:
        logger.warning(
            "iiko reserve/create paused: %s of %s requests in 24h returned 400",
            stats["bad_requests"], stats["total"],
        )
        raise IikoCreatePaused(
            f"sending to iiko paused: {stats['bad_requests']} of {stats['total']} "
            "reserve/create requests in the last 24h were rejected"
        )

    data = _authed_post(config["iiko_api_login"], RESERVE_CREATE_PATH, {
        "organizationId": config["iiko_organization_id"],
        "terminalGroupId": config["iiko_terminal_group_id"],
        "customer": {
            "name": customer_name,
            "surname": customer_surname or "",
        },
        "phone": phone,
        "guestsCount": guests_count,
        "durationInMinutes": duration_minutes,
        "shouldRemind": False,
        "estimatedStartTime": estimated_start_time,
        "tableIds": iiko_table_ids,
        "comment": comment,
    })

    if "reserveInfo" not in data:
        error_desc = data.get("errorDescription", str(data))
        raise RuntimeError(f"iiko reserve creation failed: {error_desc}")

    return data["reserveInfo"]


def cancel_reserve(restaurant_id: int, iiko_reserve_id: str, reason: str = "Other") -> dict:
    """Cancel a reserve in iiko.

    reason: 'Other' or 'ClientRefused'
    """
    config = _get_restaurant_iiko_config(restaurant_id)
    if not config:
        raise RuntimeError("iiko is not configured for this restaurant")

    data = _authed_post(config["iiko_api_login"], "/api/1/reserve/cancel", {
        "organizationId": config["iiko_organization_id"],
        "reserveId": iiko_reserve_id,
        "cancelReason": reason,
    })

    if "error" in data:
        raise RuntimeError(f"iiko cancel failed: {data.get('errorDescription', str(data))}")

    return data
