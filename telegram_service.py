import json
import os
from urllib import error, parse, request

from db import execute_returning, query_all


TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
ADMIN_WEB_URL = os.getenv("ADMIN_WEB_URL", "http://localhost:3000/admin").rstrip("/")


def serialize_telegram_recipient(row):
    return {
        "id": row["id"],
        "chatId": row["chat_id"],
        "label": row["label"],
        "isActive": row["is_active"],
        "createdAt": row["created_at"].isoformat(),
    }


def list_telegram_recipients():
    rows = query_all(
        """
        SELECT id, chat_id, label, is_active, created_at
        FROM telegram_recipients
        ORDER BY is_active DESC, created_at ASC, id ASC
        """
    )
    return [serialize_telegram_recipient(row) for row in rows]


def add_telegram_recipient(chat_id, label=None, is_active=True):
    if not str(chat_id).strip():
        raise ValueError("chat_id is required")
    row = execute_returning(
        """
        INSERT INTO telegram_recipients (chat_id, label, is_active)
        VALUES (%s, %s, %s)
        RETURNING id, chat_id, label, is_active, created_at
        """,
        (str(chat_id).strip(), (label or "").strip() or None, bool(is_active)),
    )
    return serialize_telegram_recipient(row)


def delete_telegram_recipient(recipient_id):
    return execute_returning(
        """
        DELETE FROM telegram_recipients
        WHERE id = %s
        RETURNING id
        """,
        (recipient_id,),
    )


def _send_telegram_message(chat_id, text, reservation_url):
    if not TELEGRAM_BOT_TOKEN:
        return False

    payload = {
        "chat_id": str(chat_id),
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": {
            "inline_keyboard": [[{"text": "Open reservation", "url": reservation_url}]]
        },
    }
    req = request.Request(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=10) as response:
            return 200 <= response.status < 300
    except error.URLError:
        return False


def notify_pending_reservation(reservation):
    recipients = query_all(
        """
        SELECT chat_id
        FROM telegram_recipients
        WHERE is_active = TRUE
        ORDER BY id ASC
        """
    )
    if not recipients:
        return {"enabled": bool(TELEGRAM_BOT_TOKEN), "sent": 0}

    table_ids = reservation.get("table_ids") or ([] if reservation.get("tableId") is None else [reservation["tableId"]])
    table_rows = (
        query_all("SELECT id, name FROM tables WHERE id = ANY(%s::int[]) ORDER BY id", (list(table_ids),))
        if table_ids
        else []
    )
    table_names_by_id = {row["id"]: row["name"] for row in table_rows}
    table_label = (
        " + ".join(table_names_by_id.get(table_id, f"#{table_id}") for table_id in table_ids)
        if table_ids
        else "auto"
    )
    reservation_url = (
        f"{ADMIN_WEB_URL}?reservationId={reservation['id']}"
        f"&date={parse.quote(str(reservation['date']))}"
        f"&view=queue"
    )
    lines = [
        "<b>Reservation needs confirmation</b>",
        f"ID: #{reservation['id']}",
        f"Status: {reservation['status']}",
        f"Guest: {reservation.get('customer_name') or (reservation.get('firstName', '') + ' ' + reservation.get('lastName', '')).strip()}",
        f"Phone: {reservation.get('phone') or '-'}",
        f"Email: {reservation.get('email') or '-'}",
        f"Date: {reservation['date']}",
        f"Time: {reservation['time']} - {reservation['endTime']}",
        f"Guests: {reservation['guests']}",
        f"Sets: {reservation.get('sets', 1)}",
        f"Tables: {table_label}",
        f"Confirmation code: {reservation.get('confirmation_code') or '-'}",
        f"Note: {reservation.get('note') or '-'}",
    ]
    text = "\n".join(lines)

    sent = 0
    for recipient in recipients:
        if _send_telegram_message(recipient["chat_id"], text, reservation_url):
            sent += 1
    return {"enabled": bool(TELEGRAM_BOT_TOKEN), "sent": sent}
