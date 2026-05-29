"use client"

import { useState } from "react"
import type { Booking } from "@/app/admin/page"
import { ArrivalStatusBadge } from "@/components/admin/arrival-status-badge"
import { Button } from "@/components/ui/button"
import { adminApi } from "@/lib/api"
import {
  canShowArrivalButton,
  computeArrivalUiStatus,
  normalizeBooking,
} from "@/lib/arrival-status"

type ReservationArrivalControlsProps = {
  booking: Booking
  onUpdated?: (booking: Booking) => void
  /** inline = sits in list card column; block = full width under mini card */
  layout?: "inline" | "block"
}

const btnBase =
  "h-11 min-h-[44px] rounded-lg border-2 text-sm font-bold shadow-md sm:text-base"

/**
 * List + grid only (not sidebar).
 * Before slot: badge «Ожидает». During slot: big «Пришёл» (2-step). After slot: badge «Не актуально».
 */
export function ReservationArrivalControls({
  booking,
  onUpdated,
  layout = "block",
}: ReservationArrivalControlsProps) {
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (booking.status !== "confirmed") return null

  const uiStatus = computeArrivalUiStatus(booking)
  const showButton = canShowArrivalButton(booking)

  const stop = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const wrapClass =
    layout === "inline" ? "mb-2 w-full min-w-0 max-w-full" : "mt-2 w-full min-w-0 max-w-full"
  const badgeWrap = layout === "inline" ? "mb-2 w-full min-w-0" : "mt-2 w-full min-w-0"
  const confirmButtonsClass =
    layout === "inline"
      ? "flex w-full min-w-0 max-w-full flex-col gap-2"
      : "flex w-full min-w-0 max-w-full flex-col gap-2 sm:flex-row"

  if (!showButton) {
    return (
      <div className={badgeWrap} onClick={stop} onPointerDown={stop}>
        <ArrivalStatusBadge status={uiStatus} />
      </div>
    )
  }

  const handleConfirmArrival = async (e: React.MouseEvent) => {
    stop(e)
    setSubmitting(true)
    try {
      const result = await adminApi.markReservationArrived(booking.id)
      onUpdated?.(normalizeBooking(result.reservation as Record<string, unknown>))
      setConfirming(false)
    } catch {
      /* ignore */
    } finally {
      setSubmitting(false)
    }
  }

  if (confirming) {
    return (
      <div className={wrapClass} onClick={stop} onPointerDown={stop}>
        <div className={confirmButtonsClass}>
        <Button
          type="button"
          disabled={submitting}
          className={`${btnBase} min-w-0 flex-1 border-emerald-800 bg-emerald-600 text-white hover:bg-emerald-700`}
          onClick={(e) => void handleConfirmArrival(e)}
        >
          Подтвердить
        </Button>
        <Button
          type="button"
          disabled={submitting}
          className={`${btnBase} min-w-0 flex-1 border-slate-400 bg-white text-slate-900 hover:bg-slate-100`}
          onClick={(e) => {
            stop(e)
            setConfirming(false)
          }}
        >
          Отмена
        </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={wrapClass} onClick={stop} onPointerDown={stop}>
      <div className="mb-2">
        <ArrivalStatusBadge status={uiStatus} />
      </div>
      <Button
        type="button"
        className={`${btnBase} w-full border-emerald-800 bg-emerald-500 text-white hover:bg-emerald-600`}
        onClick={(e) => {
          stop(e)
          setConfirming(true)
        }}
      >
        Пришёл
      </Button>
    </div>
  )
}
