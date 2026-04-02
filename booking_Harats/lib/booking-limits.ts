/** Max party size (guests) and max sets — public booking + admin create/edit */
export const MAX_PARTY_SIZE = 15
export const MAX_SETS = 15

export const partySizeOptions = Array.from({ length: MAX_PARTY_SIZE }, (_, i) => String(i + 1))
export const setCountOptions = Array.from({ length: MAX_SETS }, (_, i) => String(i + 1))
