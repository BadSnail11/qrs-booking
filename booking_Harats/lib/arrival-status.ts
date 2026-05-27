import type { Booking } from "@/app/admin/page"
import type { ArrivalUiStatus } from "@/components/admin/arrival-status-badge"

export function normalizeArrivalStatus(
  raw: Record<string, unknown>
): Booking["arrivalStatus"] {
  const v = raw.arrivalStatus ?? raw.arrival_status
  if (v === "arrived" || v === "no_show") return v
  return null
}

export function normalizeBooking(raw: Record<string, unknown>): Booking {
  return {
    ...(raw as unknown as Booking),
    arrivalStatus: normalizeArrivalStatus(raw),
  }
}

export function bookingSlotBounds(booking: Booking): { start: Date; end: Date } {
  const start = booking.reservation_time
    ? new Date(booking.reservation_time)
    : new Date(`${booking.date}T${booking.time}:00`)

  const endDate = booking.endDate ?? booking.date
  let end = new Date(`${endDate}T${booking.endTime}:00`)

  // Legacy payloads: endTime "00:00" on same date when slot crosses midnight
  if (!booking.endDate && end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  }

  return { start, end }
}

export function isBeforeReservationSlot(booking: Booking, now: Date = new Date()): boolean {
  const { start } = bookingSlotBounds(booking)
  return now < start
}

export function isDuringReservationSlot(booking: Booking, now: Date = new Date()): boolean {
  const { start, end } = bookingSlotBounds(booking)
  return now >= start && now <= end
}

export function isAfterReservationSlot(booking: Booking, now: Date = new Date()): boolean {
  const { end } = bookingSlotBounds(booking)
  return now > end
}

export function isGuestMarkedArrived(booking: Booking): boolean {
  return booking.arrivalStatus === "arrived"
}

/** UI-only status from time window + stored arrival_status (DB is not changed after slot ends). */
export function computeArrivalUiStatus(booking: Booking, now: Date = new Date()): ArrivalUiStatus {
  if (booking.status !== "confirmed") {
    return "not_actual"
  }

  if (isAfterReservationSlot(booking, now)) {
    return "not_actual"
  }

  if (isBeforeReservationSlot(booking, now)) {
    return "awaiting"
  }

  // During reservation slot
  if (booking.arrivalStatus === "arrived") {
    return "arrived"
  }

  return "not_arrived"
}

/** «Пришёл» button only while the reservation slot is active and guest not marked arrived. */
export function canShowArrivalButton(booking: Booking, now: Date = new Date()): boolean {
  return (
    booking.status === "confirmed" &&
    isDuringReservationSlot(booking, now) &&
    !isGuestMarkedArrived(booking)
  )
}

export function arrivalUiToStoredStatus(ui: ArrivalUiStatus): "arrived" | "no_show" | null {
  if (ui === "arrived" || ui === "not_actual") return "arrived"
  if (ui === "not_arrived") return "no_show"
  return null
}

export type ArrivalStoredStatus = "arrived" | "no_show"

/** Edit page: before slot — read-only; during and after slot — editable. */
export function canAdminEditArrivalStatus(booking: Booking, now: Date = new Date()): boolean {
  return booking.status === "confirmed" && !isBeforeReservationSlot(booking, now)
}

export function getAdminArrivalEditValue(booking: Booking): ArrivalStoredStatus | undefined {
  if (booking.arrivalStatus === "arrived" || booking.arrivalStatus === "no_show") {
    return booking.arrivalStatus
  }
  return undefined
}
