"use client"

import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Booking, Table } from "@/app/admin/page"
import { ReservationArrivalControls } from "@/components/admin/reservation-arrival-controls"

interface TablesGridProps {
  tables: Table[]
  bookings: Booking[]
  onEditBooking: (booking: Booking) => void
  onBlockTable: (table: Table) => void
  onReservationUpdated?: (booking: Booking) => void
}

export function TablesGrid({
  tables,
  bookings,
  onEditBooking,
  onBlockTable,
  onReservationUpdated,
}: TablesGridProps) {
  const getTableBookings = (tableId: number) => {
    return bookings
      .filter((b) => (b.table_ids && b.table_ids.length > 0 ? b.table_ids.includes(tableId) : b.tableId === tableId))
      .sort((a, b) => a.time.localeCompare(b.time))
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
      {tables.map((table) => {
        const tableBookings = getTableBookings(table.id)

        return (
          <div key={table.id} className="rounded-2xl border border-border bg-card p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between sm:mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{table.name}</h3>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {table.minCapacity}-{table.maxCapacity}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8"
                onClick={() => onBlockTable(table)}
              >
                <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            </div>

            {table.isBlocked ? (
              <div className="rounded-lg bg-red-50 p-2 text-center text-xs text-red-600 sm:p-3 sm:text-sm">
                Заблокирован до {table.blockedUntil}
                <br />
                <span className="text-[10px] sm:text-xs">{table.blockedReason}</span>
              </div>
            ) : (
              <div className="space-y-1">
                {tableBookings.length === 0 ? (
                  <div className="py-4 text-center text-xs text-muted-foreground sm:py-6 sm:text-sm">
                    Нет бронирований
                  </div>
                ) : (
                  tableBookings.map((booking) => (
                    <div
                      key={booking.id}
                      className={`w-full rounded-lg border-l-4 p-2 text-left ${booking.color}`}
                    >
                      <button
                        type="button"
                        onClick={() => onEditBooking(booking)}
                        className="w-full text-left transition-colors hover:opacity-80"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground sm:text-xs">
                            {booking.time}-{booking.endTime}
                          </span>
                          <span className="text-[10px] text-muted-foreground sm:text-xs">{booking.guests} гост.</span>
                        </div>
                        <div className="truncate text-sm font-medium text-foreground">{booking.firstName}</div>
                        {booking.table_ids && booking.table_ids.length > 1 && (
                          <div className="text-[10px] text-muted-foreground sm:text-xs">
                            Столы: {booking.table_ids.join(" + ")}
                          </div>
                        )}
                      </button>
                      {booking.status === "confirmed" ? (
                        <ReservationArrivalControls booking={booking} onUpdated={onReservationUpdated} layout="block" />
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
