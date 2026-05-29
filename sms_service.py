import json
import logging
import os
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

SMS_CENTRE_LOGIN = os.getenv("SMS_CENTRE_LOGIN", "").strip()
SMS_CENTRE_PASSWORD = os.getenv("SMS_CENTRE_PASSWORD", "").strip()
SMS_CENTRE_API_URL = os.getenv(
    "SMS_CENTRE_API_URL", "https://smscentre.by/rest/send/"
).strip()
SMS_CENTRE_SENDER = os.getenv("SMS_CENTRE_SENDER", "booking.mise.by").strip()


def sms_enabled():
    return bool(SMS_CENTRE_LOGIN and SMS_CENTRE_PASSWORD)


def _parse_response_body(raw: str) -> dict | str:
    raw = (raw or "").strip()
    if not raw:
        return ""
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return raw


def _response_indicates_error(body) -> str | None:
    if isinstance(body, str):
        upper = body.upper()
        if upper.startswith("ERROR"):
            return body
        return None
    if isinstance(body, dict):
        err = body.get("error") or body.get("error_code") or body.get("error_code_str")
        if err not in (None, "", 0, "0"):
            return str(err)
    return None


def send_sms(phones: str, message: str) -> dict:
    """Send SMS via smscentre.by REST API (POST JSON)."""
    if not sms_enabled():
        logger.warning(
            "SMS skipped (credentials not configured): phones=%s message=%s",
            phones,
            message[:80],
        )
        return {"enabled": False, "sent": False, "dev_mode": True}

    payload = {
        "login": SMS_CENTRE_LOGIN,
        "psw": SMS_CENTRE_PASSWORD,
        "phones": phones,
        "mes": message,
        "sender": SMS_CENTRE_SENDER,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        SMS_CENTRE_API_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as exc:
        logger.exception("SMS send failed: phones=%s error=%s", phones, exc)
        raise RuntimeError("Не удалось отправить SMS. Попробуйте позже.") from exc

    body = _parse_response_body(raw)
    err = _response_indicates_error(body)
    if err:
        logger.error("SMS provider error: phones=%s response=%s", phones, raw[:500])
        raise RuntimeError("Сервис SMS вернул ошибку. Попробуйте позже.")

    logger.info("SMS sent: phones=%s response=%s", phones, str(body)[:120])
    return {"enabled": True, "sent": True, "response": body}
