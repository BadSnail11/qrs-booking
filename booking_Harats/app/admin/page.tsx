"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { addDays, format } from "date-fns"
import { Plus, List, Grid3X3 } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { BlockTableModal } from "@/components/admin/block-table-modal"
import { ReservationStatusBadge } from "@/components/admin/reservation-status-badge"
import { TablesGrid } from "@/components/admin/tables-grid"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { adminApi } from "@/lib/api"
import { formatSetsLabel } from "@/lib/booking-limits"
import { cn } from "@/lib/utils"

export type Booking = {
  id: string
  firstName: string
  lastName: string
  phone: string
  email?: string
  guests: number
  sets: number
  date: string
  time: string
  endTime: string
  tableId: number
  table_ids?: number[]
  note?: string
  status: "confirmed" | "pending" | "cancelled"
  color: string
}

export type Table = {
  id: number
  name: string
  minCapacity: number
  maxCapacity: number
  isActive?: boolean
  canUnite?: boolean
  uniteWithTableId?: number | null
  isBlocked?: boolean
  blockedUntil?: string
  blockedReason?: string
}

type ListStatusFilter = "all" | "pending" | "confirmed" | "cancelled"

function getTableSortNumber(name: string) {
  const match = name.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER
}

function compareTableNames(a: Table, b: Table) {
  const aNum = getTableSortNumber(a.name)
  const bNum = getTableSortNumber(b.name)
  if (aNum !== bNum) return aNum - bNum
  return a.name.localeCompare(b.name, "ru", { numeric: true, sensitivity: "base" })
}

function compareBookingsByDateTime(a: Booking, b: Booking) {
  return `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
}

function getReservationColorIndexClass(status: Booking["status"]) {
  if (status === "confirmed") return "bg-green-400"
  if (status === "pending") return "bg-yellow-400"
  return "bg-slate-400"
}

export default function AdminPage() {
  const router = useRouter()
  /** Center of the 7-day strip; when no explicit day is selected, tables/sidebar/grid use this day */
  const [weekAnchor, setWeekAnchor] = useState(() => new Date())
  /** Null = list + sidebar queues show all reservations; grid/tables still use weekAnchor day */
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => new Date())
  const [searchQuery, setSearchQuery] = useState("")
  const [bookings, setBookings] = useState<Booking[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [error, setError] = useState("")
  const [mobileView, setMobileView] = useState<"list" | "grid">("list")
  const [showSidebar, setShowSidebar] = useState(false)
  const [reservationViewMode, setReservationViewMode] = useState<"queue" | "confirmed">("queue")
  const [listStatusFilter, setListStatusFilter] = useState<ListStatusFilter>("all")
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false)
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)

  const dateStr = useMemo(
    () => format(selectedDate ?? weekAnchor, "yyyy-MM-dd"),
    [selectedDate, weekAnchor]
  )

  const loadData = async () => {
    try {
      setError("")
      const [tablesData, bookingsData] = await Promise.all([
        adminApi.getTables(dateStr),
        adminApi.getReservations(undefined, searchQuery || undefined),
      ])
      setTables(tablesData as Table[])
      setBookings(bookingsData as Booking[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные")
    }
  }

  useEffect(() => {
    void loadData()
  }, [dateStr, searchQuery])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadData()
    }, 15000)

    return () => window.clearInterval(intervalId)
  }, [dateStr, searchQuery])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const dateParam = params.get("date")
    const viewParam = params.get("view")
    if (dateParam) {
      const d = new Date(`${dateParam}T00:00:00`)
      setSelectedDate(d)
      setWeekAnchor(d)
    }
    if (viewParam === "confirmed" || viewParam === "queue") {
      setReservationViewMode(viewParam)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const reservationId = params.get("reservationId")
    if (!reservationId) return
    const paramsOut = new URLSearchParams()
    if (dateStr) paramsOut.set("date", dateStr)
    if (reservationViewMode) paramsOut.set("view", reservationViewMode)
    router.replace(`/admin/reservations/${reservationId}/edit?${paramsOut.toString()}`)
  }, [router, dateStr, reservationViewMode])

  const searchableBookings = useMemo(
    () =>
      bookings.filter((booking) => {
        if (searchQuery === "") return true
        const normalizedQuery = searchQuery.toLowerCase()
        return (
          booking.firstName.toLowerCase().includes(normalizedQuery) ||
          booking.lastName.toLowerCase().includes(normalizedQuery) ||
          (booking.note || "").toLowerCase().includes(normalizedQuery) ||
          booking.phone.includes(searchQuery)
        )
      }),
    [bookings, searchQuery]
  )

  const sortedTables = useMemo(() => [...tables].sort(compareTableNames), [tables])

  const tableNameById = useMemo(
    () => new Map(sortedTables.map((table) => [table.id, table.name])),
    [sortedTables]
  )

  const selectedDateBookings = useMemo(
    () => searchableBookings.filter((booking) => booking.date === dateStr),
    [searchableBookings, dateStr]
  )

  /** Sidebar (pending / cancelled / mobile confirmed): all dates when no day selected, else selected day only */
  const sidebarScopeBookings = useMemo(
    () => (selectedDate === null ? searchableBookings : selectedDateBookings),
    [selectedDate, searchableBookings, selectedDateBookings]
  )

  const pendingBookings = useMemo(() => {
    const list = sidebarScopeBookings.filter((booking) => booking.status === "pending")
    return selectedDate === null
      ? [...list].sort(compareBookingsByDateTime)
      : [...list].sort((a, b) => a.time.localeCompare(b.time))
  }, [sidebarScopeBookings, selectedDate])

  const cancelledBookings = useMemo(() => {
    const list = sidebarScopeBookings.filter((booking) => booking.status === "cancelled")
    return selectedDate === null
      ? [...list].sort(compareBookingsByDateTime)
      : [...list].sort((a, b) => a.time.localeCompare(b.time))
  }, [sidebarScopeBookings, selectedDate])

  /** Grid view + header count: always the anchor/selected calendar day */
  const confirmedBookings = useMemo(
    () =>
      selectedDateBookings
        .filter((booking) => booking.status === "confirmed")
        .sort((a, b) => a.time.localeCompare(b.time)),
    [selectedDateBookings]
  )

  const sidebarConfirmedBookings = useMemo(() => {
    const list = sidebarScopeBookings.filter((booking) => booking.status === "confirmed")
    return selectedDate === null
      ? [...list].sort(compareBookingsByDateTime)
      : [...list].sort((a, b) => a.time.localeCompare(b.time))
  }, [sidebarScopeBookings, selectedDate])

  const listBookings = useMemo(() => {
    const source =
      mobileView === "list" && selectedDate === null ? searchableBookings : selectedDateBookings
    return source
      .filter((booking) => listStatusFilter === "all" || booking.status === listStatusFilter)
      .sort(compareBookingsByDateTime)
  }, [mobileView, selectedDate, searchableBookings, selectedDateBookings, listStatusFilter])

  const getTableLabel = (booking: Booking) => {
    if (booking.table_ids && booking.table_ids.length > 1) {
      return booking.table_ids.map((id) => tableNameById.get(id) || `#${id}`).join(" + ")
    }
    return tableNameById.get(booking.tableId) || `#${booking.tableId}`
  }

  const handleDateChange = (date: Date) => {
    setSelectedDate(date)
    setWeekAnchor(date)
  }

  const handleDatePillClick = (day: Date) => {
    const dayStr = format(day, "yyyy-MM-dd")
    const selectedStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null
    if (mobileView === "list" && selectedStr === dayStr) {
      setSelectedDate(null)
      return
    }
    setSelectedDate(day)
    setWeekAnchor(day)
  }

  const handleShiftDay = (delta: number) => {
    if (selectedDate) {
      const next = addDays(selectedDate, delta)
      setSelectedDate(next)
      setWeekAnchor(next)
    } else {
      setWeekAnchor((a) => addDays(a, delta))
    }
  }

  const handleEditBooking = (booking: Booking) => {
    const params = new URLSearchParams({
      date: booking.date,
      view: reservationViewMode,
    })
    router.push(`/admin/reservations/${booking.id}/edit?${params.toString()}`)
  }

  const handleBlockTable = (table: Table) => {
    setSelectedTable(table)
    setIsBlockModalOpen(true)
  }

  const openCreateBookingPage = () => {
    const params = new URLSearchParams({
      date: dateStr,
      view: reservationViewMode,
    })
    router.push(`/admin/reservations/new?${params.toString()}`)
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <AdminHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        weekAnchor={weekAnchor}
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        onDatePillClick={handleDatePillClick}
        onShiftDay={handleShiftDay}
        mobileView={mobileView}
        onAnalyticsClick={() => router.push("/admin/analytics")}
        onSettingsClick={() => router.push("/admin/settings")}
        onToggleSidebar={() => setShowSidebar(!showSidebar)}
      />

      <div className="border-b border-border bg-card px-4 py-3 lg:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-xl bg-muted p-1">
              <Button
                variant={mobileView === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setMobileView("list")}
                className="h-8 gap-1.5"
              >
                <List className="h-4 w-4" />
                Список
              </Button>
              <Button
                variant={mobileView === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setMobileView("grid")}
                className="h-8 gap-1.5"
              >
                <Grid3X3 className="h-4 w-4" />
                Столы
              </Button>
            </div>

            {mobileView === "list" && (
              <>
                <Select value={listStatusFilter} onValueChange={(value) => setListStatusFilter(value as ListStatusFilter)}>
                  <SelectTrigger className="h-9 w-full rounded-xl bg-background sm:w-[190px]">
                    <SelectValue placeholder="Статус" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все статусы</SelectItem>
                    <SelectItem value="pending">Ожидают</SelectItem>
                    <SelectItem value="confirmed">Подтвержденные</SelectItem>
                    <SelectItem value="cancelled">Отменённые</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {mobileView === "list" ? listBookings.length : confirmedBookings.length} бронирований
            </span>
            <Button onClick={openCreateBookingPage} className="hidden gap-2 rounded-xl lg:inline-flex">
              <Plus className="h-4 w-4" />
              Создать бронирование
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1">
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-80 transform bg-card transition-transform duration-300 lg:hidden",
            showSidebar ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <AdminSidebar
            pendingBookings={pendingBookings}
            confirmedBookings={reservationViewMode === "confirmed" ? sidebarConfirmedBookings : []}
            cancelledBookings={cancelledBookings}
            viewMode={reservationViewMode}
            onViewModeChange={setReservationViewMode}
            tables={sortedTables}
            showBookingDate={selectedDate === null}
            onCreateBooking={() => {
              openCreateBookingPage()
              setShowSidebar(false)
            }}
            onEditBooking={(booking) => {
              handleEditBooking(booking)
              setShowSidebar(false)
            }}
            onClose={() => setShowSidebar(false)}
          />
        </div>

        <div className="hidden w-80 shrink-0 border-r border-border bg-card lg:block">
          <AdminSidebar
            pendingBookings={pendingBookings}
            confirmedBookings={[]}
            cancelledBookings={[]}
            viewMode="queue"
            onViewModeChange={() => undefined}
            tables={sortedTables}
            pendingOnly
            showBookingDate={selectedDate === null}
            onCreateBooking={openCreateBookingPage}
            onEditBooking={handleEditBooking}
          />
        </div>

        {showSidebar && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setShowSidebar(false)}
          />
        )}

        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {mobileView === "list" && (
            <div className="space-y-2">
              {selectedDate === null && (
                <p className="rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
                  Дата не выбрана — в списке и в боковой панели (заявки и отмены) показаны все
                  бронирования. Выберите день в полоске или в календаре, чтобы фильтровать по дню.
                </p>
              )}
              {listBookings.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  Нет бронирований по выбранным фильтрам
                </div>
              ) : (
                listBookings.map((booking) => (
                  <button
                    key={booking.id}
                    onClick={() => handleEditBooking(booking)}
                    className={cn(
                      "w-full rounded-xl border-l-4 p-4 text-left transition-colors hover:opacity-80",
                      booking.color
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "h-3 w-3 shrink-0 rounded-full ring-2 ring-white/70",
                              getReservationColorIndexClass(booking.status)
                            )}
                            aria-hidden="true"
                          />
                          <div className="font-medium">
                            {booking.firstName} {booking.lastName}
                          </div>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {booking.date} • {booking.time} - {booking.endTime}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {getTableLabel(booking)} • {booking.guests} гостей • {formatSetsLabel(booking.sets)}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <div className="flex justify-start sm:justify-end">
                          <ReservationStatusBadge status={booking.status} />
                        </div>
                        <div>{booking.phone}</div>
                      </div>
                    </div>
                    {booking.note && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {booking.note}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          <div className={cn(mobileView === "grid" ? "block" : "hidden")}>
            <TablesGrid
              tables={sortedTables}
              bookings={confirmedBookings}
              onEditBooking={handleEditBooking}
              onBlockTable={handleBlockTable}
            />
          </div>
        </main>
      </div>

      <Button
        onClick={openCreateBookingPage}
        className="fixed bottom-6 right-6 z-20 h-14 w-14 rounded-full bg-lime-400 shadow-lg hover:bg-lime-500 lg:hidden"
        size="icon"
      >
        <Plus className="h-6 w-6 text-foreground" />
      </Button>

      <BlockTableModal
        isOpen={isBlockModalOpen}
        onClose={() => {
          setIsBlockModalOpen(false)
          setSelectedTable(null)
        }}
        table={selectedTable}
        onSuccess={() => void loadData()}
      />
    </div>
  )
}
