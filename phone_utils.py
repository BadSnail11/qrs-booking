BY_MOBILE_CODES = ("25", "29", "33", "44")


def normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if not digits:
        return ""
    if digits.startswith("80") and len(digits) == 11:
        digits = "375" + digits[2:]
    elif digits.startswith("0") and len(digits) == 10:
        digits = "375" + digits[1:]
    elif len(digits) == 9:
        digits = "375" + digits
    elif digits.startswith("89") and len(digits) == 11:
        digits = "7" + digits[1:]
    return digits


def phone_validation_error(phone: str) -> str | None:
    """None if the number can receive SMS, otherwise a message for the guest/admin.

    Rules (kept in sync with booking_Harats/lib/phone.ts):
    - Belarus: +375 + operator 25/29/33/44 + 7 digits
    - Russia: +7 9XX XXX-XX-XX
    - other countries: +<country code><number>, 11-15 digits in total
    """
    digits = normalize_phone(phone)
    if not digits:
        return "Укажите номер телефона."
    if digits.startswith("375"):
        if len(digits) != 12:
            return "Номер должен быть в формате +375 (29) 123-45-67."
        if digits[3:5] not in BY_MOBILE_CODES:
            return "Укажите мобильный номер: код оператора 25, 29, 33 или 44."
        return None
    if digits.startswith("7"):
        if len(digits) != 11 or digits[1] != "9":
            return "Номер РФ должен быть мобильным: +7 9XX XXX-XX-XX."
        return None
    if len(digits) < 11 or len(digits) > 15:
        return "Укажите номер в международном формате, например +375 (29) 123-45-67."
    return None


def phones_for_sms_api(normalized: str) -> str:
    if normalized.startswith("375"):
        return normalized
    return normalized
