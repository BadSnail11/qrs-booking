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
    return digits


def phones_for_sms_api(normalized: str) -> str:
    if normalized.startswith("375"):
        return normalized
    return normalized
