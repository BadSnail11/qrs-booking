import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from db import execute, execute_returning, query_one
from phone_utils import normalize_phone, phones_for_sms_api
from sms_service import send_sms, sms_enabled
from visitor_service import get_visitor_by_phone, is_phone_confirmed

logger = logging.getLogger(__name__)

CODE_LENGTH = 6
CODE_TTL_MINUTES = 10
TOKEN_TTL_MINUTES = 30
MAX_VERIFY_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60
PHONE_CONFIRM_VALID_DAYS = 183
PHONE_VERIFICATION_SALT = os.getenv("PHONE_VERIFICATION_SALT", "qrs-phone-verify").strip()


def _hash_code(code: str) -> str:
    payload = f"{PHONE_VERIFICATION_SALT}:{code}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _generate_code() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(CODE_LENGTH))


def _active_session_verification(restaurant_id: int, phone_normalized: str):
    """Unconsumed OTP session still valid (verified but booking not completed yet)."""
    return query_one(
        """
        SELECT verified_token, verified_expires_at
        FROM phone_verification_challenges
        WHERE restaurant_id = %s
          AND phone_normalized = %s
          AND verified_at IS NOT NULL
          AND verified_token IS NOT NULL
          AND consumed_at IS NULL
          AND verified_expires_at > NOW()
        ORDER BY verified_at DESC
        LIMIT 1
        """,
        (restaurant_id, phone_normalized),
    )


def phone_already_confirmed(restaurant_id: int, phone: str) -> dict:
    """
    Phone can skip SMS if already in CRM or still within an active verify session.
    Returns { alreadyConfirmed, verificationToken?, reason? }.
    """
    phone_normalized = normalize_phone(phone)
    if len(phone_normalized) < 10:
        return {"alreadyConfirmed": False}

    visitor = get_visitor_by_phone(restaurant_id, phone)
    if visitor and is_phone_confirmed(restaurant_id, phone, valid_days=PHONE_CONFIRM_VALID_DAYS):
        first_name = (visitor.get("first_name") or "").strip()
        last_name = (visitor.get("last_name") or "").strip()
        return {
            "alreadyConfirmed": True,
            "reason": "visitor",
            "firstName": first_name,
            "lastName": last_name,
            "namesLocked": bool(first_name and last_name),
        }

    session = _active_session_verification(restaurant_id, phone_normalized)
    if session and session.get("verified_token"):
        expires = session.get("verified_expires_at")
        seconds = 0
        if expires:
            seconds = max(0, int((expires - datetime.now(timezone.utc)).total_seconds()))
        return {
            "alreadyConfirmed": True,
            "reason": "session",
            "verificationToken": session["verified_token"],
            "expiresInSeconds": seconds,
            "namesLocked": False,
        }

    return {"alreadyConfirmed": False, "namesLocked": False}


def _recent_challenge(restaurant_id: int, phone_normalized: str):
    return query_one(
        """
        SELECT *
        FROM phone_verification_challenges
        WHERE restaurant_id = %s
          AND phone_normalized = %s
          AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (restaurant_id, phone_normalized),
    )


def send_phone_verification_code(restaurant_id: int, phone: str) -> dict:
    phone_normalized = normalize_phone(phone)
    if len(phone_normalized) < 10:
        raise ValueError("Некорректный номер телефона")

    confirmed = phone_already_confirmed(restaurant_id, phone)
    if confirmed.get("alreadyConfirmed"):
        result = {
            "sent": False,
            "alreadyConfirmed": True,
            "reason": confirmed.get("reason"),
        }
        if confirmed.get("verificationToken"):
            result["verificationToken"] = confirmed["verificationToken"]
            result["expiresInSeconds"] = confirmed.get("expiresInSeconds", 0)
        return result

    recent = _recent_challenge(restaurant_id, phone_normalized)
    if recent and not recent.get("verified_at"):
        created_at = recent["created_at"]
        if isinstance(created_at, datetime):
            elapsed = (datetime.now(timezone.utc) - created_at).total_seconds()
            if elapsed < RESEND_COOLDOWN_SECONDS:
                wait = int(RESEND_COOLDOWN_SECONDS - elapsed)
                raise ValueError(f"Подождите {wait} сек. перед повторной отправкой кода")

    code = _generate_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=CODE_TTL_MINUTES)
    row = execute_returning(
        """
        INSERT INTO phone_verification_challenges (
            restaurant_id, phone_normalized, code_hash, expires_at
        )
        VALUES (%s, %s, %s, %s)
        RETURNING id
        """,
        (restaurant_id, phone_normalized, _hash_code(code), expires_at),
    )

    message = f"Код подтверждения бронирования: {code}"
    sms_target = phones_for_sms_api(phone_normalized)
    if sms_enabled():
        send_sms(sms_target, message)
    else:
        logger.warning(
            "DEV phone verification code: restaurant_id=%s phone=%s code=%s challenge_id=%s",
            restaurant_id,
            phone_normalized,
            code,
            row["id"],
        )

    result = {"sent": True, "expiresInSeconds": CODE_TTL_MINUTES * 60}
    if not sms_enabled():
        result["devCode"] = code
    return result


def verify_phone_code(restaurant_id: int, phone: str, code: str) -> dict:
    phone_normalized = normalize_phone(phone)
    if len(phone_normalized) < 10:
        raise ValueError("Некорректный номер телефона")
    code = (code or "").strip()
    if len(code) != CODE_LENGTH or not code.isdigit():
        raise ValueError("Введите 6-значный код из SMS")

    challenge = _recent_challenge(restaurant_id, phone_normalized)
    if not challenge:
        raise ValueError("Сначала запросите код подтверждения")

    if challenge.get("verified_at") and challenge.get("verified_token"):
        if challenge.get("verified_expires_at") and challenge["verified_expires_at"] > datetime.now(timezone.utc):
            if not challenge.get("consumed_at"):
                return {
                    "verificationToken": challenge["verified_token"],
                    "expiresInSeconds": int(
                        (challenge["verified_expires_at"] - datetime.now(timezone.utc)).total_seconds()
                    ),
                }
        raise ValueError("Код устарел. Запросите новый.")

    if challenge["expires_at"] <= datetime.now(timezone.utc):
        raise ValueError("Код истёк. Запросите новый.")

    attempts = int(challenge.get("attempts") or 0) + 1
    execute(
        "UPDATE phone_verification_challenges SET attempts = %s WHERE id = %s",
        (attempts, challenge["id"]),
    )
    if attempts > MAX_VERIFY_ATTEMPTS:
        raise ValueError("Слишком много попыток. Запросите новый код.")

    if _hash_code(code) != challenge["code_hash"]:
        raise ValueError("Неверный код")

    token = secrets.token_urlsafe(32)
    verified_expires_at = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_TTL_MINUTES)
    execute(
        """
        UPDATE phone_verification_challenges
        SET verified_token = %s,
            verified_expires_at = %s,
            verified_at = NOW()
        WHERE id = %s
        """,
        (token, verified_expires_at, challenge["id"]),
    )
    return {
        "verificationToken": token,
        "expiresInSeconds": TOKEN_TTL_MINUTES * 60,
    }


def booking_phone_verified(restaurant_id: int, phone: str, token: str | None) -> bool:
    """Allow reservation when phone is recently confirmed or token is valid."""
    if is_phone_confirmed(restaurant_id, phone, valid_days=PHONE_CONFIRM_VALID_DAYS):
        return True
    if token and consume_phone_verification_token(restaurant_id, phone, token):
        return True
    return False


def consume_phone_verification_token(restaurant_id: int, phone: str, token: str) -> bool:
    phone_normalized = normalize_phone(phone)
    token = (token or "").strip()
    if not phone_normalized or not token:
        return False

    challenge = query_one(
        """
        SELECT *
        FROM phone_verification_challenges
        WHERE restaurant_id = %s
          AND phone_normalized = %s
          AND verified_token = %s
          AND consumed_at IS NULL
          AND verified_expires_at > NOW()
        ORDER BY verified_at DESC NULLS LAST
        LIMIT 1
        """,
        (restaurant_id, phone_normalized, token),
    )
    if not challenge:
        return False

    execute(
        "UPDATE phone_verification_challenges SET consumed_at = NOW() WHERE id = %s",
        (challenge["id"],),
    )
    return True
