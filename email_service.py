import os
import smtplib
from email.message import EmailMessage


SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "").strip() or SMTP_USERNAME
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "QRS Booking").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").strip().lower() == "true"
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").strip().lower() == "true"


def _customer_name(reservation):
    return (
        reservation.get("customer_name")
        or f"{reservation.get('firstName', '')} {reservation.get('lastName', '')}".strip()
        or "гость"
    )


def _send_email(to_email, subject, body):
    if not SMTP_HOST or not SMTP_FROM_EMAIL or not to_email:
        return {"enabled": False, "sent": False}

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    message["To"] = to_email
    message.set_content(body)

    try:
        if SMTP_USE_SSL:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                if SMTP_USERNAME:
                    server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(message)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                if SMTP_USE_TLS:
                    server.starttls()
                if SMTP_USERNAME:
                    server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(message)
        return {"enabled": True, "sent": True}
    except Exception:
        return {"enabled": True, "sent": False}


def send_reservation_confirmed_email(reservation):
    email = reservation.get("email")
    if not email:
        return {"enabled": bool(SMTP_HOST), "sent": False}
    name = _customer_name(reservation)
    body = (
        f"Здравствуйте, {name}!\n\n"
        f"Ваше бронирование подтверждено.\n\n"
        f"Номер бронирования: #{reservation['id']}\n"
        f"Дата: {reservation['date']}\n"
        f"Время: {reservation['time']} - {reservation['endTime']}\n"
        f"Гостей: {reservation['guests']}\n"
        f"Сетов: {reservation.get('sets', 1)}\n"
        f"Телефон заведения: +375 44 762-55-46\n\n"
        f"Спасибо!"
    )
    return _send_email(email, "Ваше бронирование подтверждено", body)


def send_reservation_updated_email(reservation):
    email = reservation.get("email")
    if not email:
        return {"enabled": bool(SMTP_HOST), "sent": False}
    name = _customer_name(reservation)
    body = (
        f"Здравствуйте, {name}!\n\n"
        f"Ваше бронирование было изменено.\n\n"
        f"Номер бронирования: #{reservation['id']}\n"
        f"Дата: {reservation['date']}\n"
        f"Время: {reservation['time']} - {reservation['endTime']}\n"
        f"Гостей: {reservation['guests']}\n"
        f"Сетов: {reservation.get('sets', 1)}\n"
        f"Комментарий: {reservation.get('note') or '-'}\n"
        f"Статус: {reservation['status']}\n\n"
        f"Если у вас есть вопросы, свяжитесь с заведением."
    )
    return _send_email(email, "Ваше бронирование изменено", body)


def send_reservation_cancelled_email(reservation):
    email = reservation.get("email")
    if not email:
        return {"enabled": bool(SMTP_HOST), "sent": False}
    name = _customer_name(reservation)
    body = (
        f"Здравствуйте, {name}!\n\n"
        f"Ваше бронирование отменено.\n\n"
        f"Номер бронирования: #{reservation['id']}\n"
        f"Дата: {reservation['date']}\n"
        f"Время: {reservation['time']} - {reservation['endTime']}\n\n"
        f"Если это произошло по ошибке, пожалуйста, свяжитесь с заведением."
    )
    return _send_email(email, "Ваше бронирование отменено", body)
