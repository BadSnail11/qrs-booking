"use client"

import { Users, MessageSquare, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Booking } from "@/app/admin/page"
import { ReservationStatusBadge } from "@/components/admin/reservation-status-badge"

interface AdminSidebarProps {
  pendingBookings: Booking[]
  confirmedBookings: Booking[]
  cancelledBookings: Booking[]
  viewMode: "queue" | "confirmed"
  onViewModeChange: (mode: "queue" | "confirmed") => void
  tables?: { id: number; name: string }[]
  onCreateBooking: () => void
  onEditBooking: (booking: Booking) => void
  onClose?: () => void
  pendingOnly?: boolean
  /** When true, show booking.date on each card (e.g. when admin cleared day selection) */
  showBookingDate?: boolean
}

export function AdminSidebar({
  pendingBookings,
  confirmedBookings,
  cancelledBookings,
  viewMode,
  onViewModeChange,
  tables = [],
  onCreateBooking,
  onEditBooking,
  onClose,
  pendingOnly = false,
  showBookingDate = false,
}: AdminSidebarProps) {
  const getTableLabel = (booking: Booking) => {
    if (booking.table_ids && booking.table_ids.length > 1) {
      return booking.table_ids
        .map((id) => tables.find((table) => table.id === id)?.name || `#${id}`)
        .join(" + ")
    }
    return tables.find((table) => table.id === booking.tableId)?.name
  }

  return (
    <aside className="flex h-full flex-col border-r border-border bg-card">
      {/* Mobile close button */}
      <div className="flex items-center justify-between border-b border-border p-4 lg:hidden">
        <span className="font-medium">Бронирования</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="sticky top-0 z-10 border-b border-border bg-card p-4">
        <Button
          onClick={onCreateBooking}
          className="w-full gap-2 rounded-xl bg-lime-200 py-6 text-foreground hover:bg-lime-300"
        >
          <Plus className="h-5 w-5" />
          <span className="font-medium">
            Создать бронирование
          </span>
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Stats */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-pink-100 px-3 py-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-xs font-medium text-white">
              {pendingBookings.length}
            </span>
            <span className="text-sm font-medium text-foreground">Заявки</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Отменённые: {cancelledBookings.length}
          </div>
        </div>

        {!pendingOnly && (
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => onViewModeChange("queue")}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                viewMode === "queue" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Ожидание и отмены
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("confirmed")}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                viewMode === "confirmed" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Подтвержденные
            </button>
          </div>
        )}

        <div className="space-y-4">
          {pendingOnly || viewMode === "queue" ? (
            <>
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Ожидают подтверждения
                </div>
                <div className="space-y-2">
                  {pendingBookings.length === 0 ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      Нет ожидающих бронирований
                    </div>
                  ) : (
                    pendingBookings.map((booking) => (
                      <button
                        key={booking.id}
                        onClick={() => onEditBooking(booking)}
                        className={`w-full rounded-xl border-l-4 p-3 text-left transition-colors hover:opacity-80 ${booking.color}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-foreground">{booking.firstName}</div>
                          <ReservationStatusBadge status={booking.status} />
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {showBookingDate && <span className="font-medium text-foreground/80">{booking.date} · </span>}
                          {booking.time}-{booking.endTime}
                        </div>
                        {getTableLabel(booking) && (
                          <div className="text-xs text-muted-foreground">{getTableLabel(booking)}</div>
                        )}
                        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {booking.guests}
                          </span>
                          {booking.note && (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {!pendingOnly && (
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Отменённые бронирования
                  </div>
                  <div className="space-y-2">
                    {cancelledBookings.length === 0 ? (
                      <div className="py-4 text-center text-sm text-muted-foreground">
                        Нет отменённых бронирований
                      </div>
                    ) : (
                      cancelledBookings.map((booking) => (
                        <button
                          key={booking.id}
                          onClick={() => onEditBooking(booking)}
                          className="w-full rounded-xl border-l-4 border-l-slate-400 bg-slate-100 p-3 text-left transition-colors hover:opacity-80"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-foreground">{booking.firstName}</div>
                            <ReservationStatusBadge status={booking.status} />
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {showBookingDate && <span className="font-medium text-foreground/80">{booking.date} · </span>}
                            {booking.time}-{booking.endTime}
                          </div>
                          {getTableLabel(booking) && (
                            <div className="text-xs text-muted-foreground">{getTableLabel(booking)}</div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Подтвержденные бронирования
              </div>
              <div className="space-y-2">
                {confirmedBookings.length === 0 ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    Нет подтвержденных бронирований
                  </div>
                ) : (
                  confirmedBookings.map((booking) => (
                  <button
                    key={booking.id}
                    onClick={() => onEditBooking(booking)}
                    className={`w-full rounded-xl border-l-4 p-3 text-left transition-colors hover:opacity-80 ${booking.color}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-foreground">{booking.firstName}</div>
                      <ReservationStatusBadge status={booking.status} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {showBookingDate && <span className="font-medium text-foreground/80">{booking.date} · </span>}
                      {booking.time}-{booking.endTime}
                    </div>
                    {getTableLabel(booking) && (
                      <div className="text-xs text-muted-foreground">{getTableLabel(booking)}</div>
                    )}
                    <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {booking.guests}
                      </span>
                      {booking.note && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
