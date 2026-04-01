import json
import os
from html import escape
from urllib import error, parse, request

from db import execute, execute_returning, query_all


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
        return None

    payload = {
        "chat_id": str(chat_id),
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": {
            "inline_keyboard": [[{"text": "Открыть бронирование", "url": reservation_url}]]
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
            if not (200 <= response.status < 300):
                return None
            payload = json.loads(response.read().decode("utf-8"))
            result = payload.get("result") or {}
            return result.get("message_id")
    except error.URLError:
        return None


def _delete_telegram_message(chat_id, message_id):
    if not TELEGRAM_BOT_TOKEN:
        return False

    payload = {
        "chat_id": str(chat_id),
        "message_id": int(message_id),
    }
    req = request.Request(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/deleteMessage",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=10) as response:
            return 200 <= response.status < 300
    except (error.URLError, ValueError):
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
        f"{ADMIN_WEB_URL}/reservations/{reservation['id']}/edit"
        f"?date={parse.quote(str(reservation['date']))}&view=queue"
    )
    guest_name = reservation.get("customer_name") or (
        (reservation.get("firstName", "") + " " + reservation.get("lastName", "")).strip()
    )
    lines = [
        "<b>Бронирование требует подтверждения</b>",
        f"Номер: #{reservation['id']}",
        f"Статус: {escape(str(reservation['status']))}",
        f"Гость: {escape(guest_name or '-')}",
        f"Телефон: {escape(str(reservation.get('phone') or '-'))}",
        f"Email: {escape(str(reservation.get('email') or '-'))}",
        f"Дата: {escape(str(reservation['date']))}",
        f"Время: {escape(str(reservation['time']))} - {escape(str(reservation['endTime']))}",
        f"Гостей: {reservation['guests']}",
        f"Сетов: {reservation.get('sets', 1)}",
        f"Столы: {escape(table_label)}",
        f"Комментарий: {escape(str(reservation.get('note') or '-'))}",
    ]
    text = "\n".join(lines)

    sent = 0
    for recipient in recipients:
        message_id = _send_telegram_message(recipient["chat_id"], text, reservation_url)
        if message_id:
            execute(
                """
                INSERT INTO telegram_notifications (reservation_id, chat_id, message_id)
                VALUES (%s, %s, %s)
                ON CONFLICT (reservation_id, chat_id, message_id) DO NOTHING
                """,
                (reservation["id"], str(recipient["chat_id"]), int(message_id)),
            )
            sent += 1
    return {"enabled": bool(TELEGRAM_BOT_TOKEN), "sent": sent}


def delete_reservation_notifications(reservation_id):
    notifications = query_all(
        """
        SELECT id, chat_id, message_id
        FROM telegram_notifications
        WHERE reservation_id = %s
        ORDER BY id ASC
        """,
        (reservation_id,),
    )
    deleted = 0
    for notification in notifications:
        if _delete_telegram_message(notification["chat_id"], notification["message_id"]):
            deleted += 1
        execute("DELETE FROM telegram_notifications WHERE id = %s", (notification["id"],))
    return {"deleted": deleted, "tracked": len(notifications)}
