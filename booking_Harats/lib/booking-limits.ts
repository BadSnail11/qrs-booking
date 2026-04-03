/** Max party size (guests) and max sets — public booking + admin create/edit */
export const MAX_PARTY_SIZE = 15
export const MAX_SETS = 15

export const partySizeOptions = Array.from({ length: MAX_PARTY_SIZE }, (_, i) => String(i + 1))
export const setCountOptions = Array.from({ length: MAX_SETS }, (_, i) => String(i + 1))

/** Inclusive calendar dates (local) when the public form may ask for number of sets */
const SETS_CHOICE_FIRST = "2026-04-09"
const SETS_CHOICE_LAST = "2036-04-26"

function toYmdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** True when the booking day is in 09.04.2026–26.04.2036 (inclusive). */
export function isDateInSetsChoiceRange(d: Date): boolean {
  const ymd = toYmdLocal(d)
  return ymd >= SETS_CHOICE_FIRST && ymd <= SETS_CHOICE_LAST
}
