import os

import resend

from db import query_all


RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "").strip()
RESEND_FROM_NAME = os.getenv("RESEND_FROM_NAME", "QRS Booking").strip()

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def _table_label(reservation):
    table_ids = reservation.get("table_ids") or ([] if reservation.get("tableId") is None else [reservation["tableId"]])
    if not table_ids:
        return "Автоматический подбор"
    rows = query_all(
        "SELECT id, name FROM tables WHERE id = ANY(%s::int[]) ORDER BY id",
        (list(table_ids),),
    )
    names_by_id = {row["id"]: row["name"] for row in rows}
    return " + ".join(names_by_id.get(table_id, f"#{table_id}") for table_id in table_ids)


def _render_email_html(title, intro, reservation):
    guest_name = reservation.get("customer_name") or (
        (reservation.get("firstName", "") + " " + reservation.get("lastName", "")).strip()
    )
    return f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin-bottom: 12px;">{title}</h2>
      <p style="margin-bottom: 16px;">{intro}</p>
      <div style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #f9fafb;">
        <p><strong>Номер:</strong> #{reservation["id"]}</p>
        <p><strong>Гость:</strong> {guest_name or "-"}</p>
        <p><strong>Дата:</strong> {reservation["date"]}</p>
        <p><strong>Время:</strong> {reservation["time"]} - {reservation["endTime"]}</p>
        <p><strong>Гостей:</strong> {reservation["guests"]}</p>
        <p><strong>Сетов:</strong> {reservation.get("sets", 1)}</p>
        <p><strong>Стол:</strong> {_table_label(reservation)}</p>
        <p><strong>Комментарий:</strong> {reservation.get("note") or "-"}</p>
      </div>
    </div>
    """


def send_reservation_email(event_type, reservation):
    recipient = (reservation or {}).get("email")
    if not recipient or not RESEND_API_KEY or not RESEND_FROM_EMAIL:
        return {"enabled": bool(RESEND_API_KEY and RESEND_FROM_EMAIL), "sent": False}

    if event_type == "confirmed":
        subject = "Ваше бронирование подтверждено"
        intro = "Хорошая новость: ваше бронирование подтверждено."
    elif event_type == "edited":
        subject = "Ваше бронирование изменено"
        intro = "Данные вашего бронирования были обновлены."
    elif event_type == "cancelled":
        subject = "Ваше бронирование отменено"
        intro = "Ваше бронирование было отменено."
    else:
        raise ValueError("Unsupported reservation email event")

    params: resend.Emails.SendParams = {
        "from": f"{RESEND_FROM_NAME} <{RESEND_FROM_EMAIL}>",
        "to": [recipient],
        "subject": subject,
        "html": _render_email_html(subject, intro, reservation),
    }
    resend.Emails.send(params)
    return {"enabled": True, "sent": True}
