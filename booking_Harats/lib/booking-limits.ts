/** Max party size (guests) and max sets — public booking + admin create/edit */
export const MAX_PARTY_SIZE = 15
export const MAX_SETS = 15

export const partySizeOptions = Array.from({ length: MAX_PARTY_SIZE }, (_, i) => String(i + 1))
export const setCountOptions = Array.from({ length: MAX_SETS }, (_, i) => String(i + 1))

/** Inclusive calendar dates (local) when the public form may ask for number of sets */
const SETS_CHOICE_FIRST = "2026-04-09"
const SETS_CHOICE_LAST = "2026-04-26"

function toYmdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** True when the booking day is in 09.04.2026–26.04.2026 (inclusive). */
export function isDateInSetsChoiceRange(d: Date): boolean {
  const ymd = toYmdLocal(d)
  return ymd >= SETS_CHOICE_FIRST && ymd <= SETS_CHOICE_LAST
}

/** Form select value for «Без сетов». API stores `sets: 0`. */
export const SETS_FORM_NONE = "none"

/** Admin / display: 0 = «Без сетов», otherwise the count. */
export function formatSetsLabel(sets: number): string {
  if (sets === 0) return "Без сетов"
  return String(sets)
}

/** Admin booking forms: value `0` is «Без сетов», then 1…MAX_SETS. */
export const adminSetSelectItems: { value: string; label: string }[] = [
  { value: "0", label: "Без сетов" },
  ...setCountOptions.map((n) => ({ value: n, label: n })),
]

/** Maps public form sets field to API integer (0 = без сетов, 1…MAX_SETS). */
export function setsFormValueToApi(setFormValue: string, date: Date | undefined): number {
  if (!date || !isDateInSetsChoiceRange(date)) return 0
  if (setFormValue === SETS_FORM_NONE) return 0
  const n = parseInt(setFormValue, 10)
  if (!Number.isFinite(n) || n < 1 || n > MAX_SETS) return 1
  return n
}
