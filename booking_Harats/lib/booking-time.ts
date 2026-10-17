import type { Booking } from "@/app/admin/page"
import { bookingSlotBounds } from "@/lib/arrival-status"

// Must match the backend defaults (SLOT_MINUTES, OPEN_ENDED_FROM, BUSINESS_DAY_END_HOUR);
// the server re-checks every reservation, these only drive UI hints.
export const SLOT_MINUTES = 120
export const OPEN_ENDED_FROM = "17:00"
export const BUSINESS_DAY_END_HOUR = 6

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

export function isOpenEndedTime(time: string, openEndedFrom: string = OPEN_ENDED_FROM): boolean {
  const minutes = minutesOf(time)
  return minutes >= minutesOf(openEndedFrom) || minutes < BUSINESS_DAY_END_HOUR * 60
}

/** Slot bounds for a reservation that does not exist yet (date "yyyy-MM-dd", time "HH:mm"). */
export function newSlotBounds(date: string, time: string): { start: Date; end: Date } {
  const start = new Date(`${date}T${time}:00`)
  let end = new Date(start.getTime() + SLOT_MINUTES * 60 * 1000)
  if (isOpenEndedTime(time)) {
    const dayEnd = new Date(start.getTime() - BUSINESS_DAY_END_HOUR * 60 * 60 * 1000)
    dayEnd.setHours(BUSINESS_DAY_END_HOUR, 0, 0, 0)
    dayEnd.setDate(dayEnd.getDate() + 1)
    if (dayEnd > end) end = dayEnd
  }
  return { start, end }
}

export function overlapsNewSlot(booking: Booking, date: string, time: string): boolean {
  const existing = bookingSlotBounds(booking)
  const candidate = newSlotBounds(date, time)
  return candidate.start < existing.end && candidate.end > existing.start
}

export function formatTimeRange(
  booking: { time: string; endTime?: string; openEnded?: boolean },
  separator = "-"
): string {
  if (booking.openEnded) return `${booking.time}, без огр. по времени`
  return booking.endTime ? `${booking.time}${separator}${booking.endTime}` : booking.time
}
