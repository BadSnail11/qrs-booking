// Same rules as phone_utils.phone_validation_error on the backend.
const BY_MOBILE_CODES = ["25", "29", "33", "44"]

export function normalizePhoneDigits(phone: string): string {
  let digits = phone.replace(/\D/g, "")
  if (!digits) return ""
  if (digits.startsWith("80") && digits.length === 11) digits = "375" + digits.slice(2)
  else if (digits.startsWith("0") && digits.length === 10) digits = "375" + digits.slice(1)
  else if (digits.length === 9) digits = "375" + digits
  else if (digits.startsWith("89") && digits.length === 11) digits = "7" + digits.slice(1)
  return digits
}

export function getPhoneError(phone: string): string | null {
  const digits = normalizePhoneDigits(phone.trim())
  if (!digits) return "Укажите номер телефона."
  if (digits.startsWith("375")) {
    if (digits.length !== 12) return "Номер должен быть в формате +375 (29) 123-45-67."
    if (!BY_MOBILE_CODES.includes(digits.slice(3, 5))) {
      return "Укажите мобильный номер: код оператора 25, 29, 33 или 44."
    }
    return null
  }
  if (digits.startsWith("7")) {
    if (digits.length !== 11 || digits[1] !== "9") return "Номер РФ должен быть мобильным: +7 9XX XXX-XX-XX."
    return null
  }
  if (digits.length < 11 || digits.length > 15) {
    return "Укажите номер в международном формате, например +375 (29) 123-45-67."
  }
  return null
}
