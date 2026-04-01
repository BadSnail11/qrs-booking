"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminHeader } from "@/components/admin/admin-header"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { TablesGrid } from "@/components/admin/tables-grid"
import { EditBookingModal } from "@/components/admin/edit-booking-modal"
import { BlockTableModal } from "@/components/admin/block-table-modal"
import { AnalyticsModal } from "@/components/admin/analytics-modal"
import { Button } from "@/components/ui/button"
import { Plus, List, Grid3X3 } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { adminApi } from "@/lib/api"

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

export type ScheduleDay = {
  weekday: number
  dayName: string
  isOpen: boolean
  openTime: string | null
  closeTime: string | null
}

export default function AdminPage() {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [searchQuery, setSearchQuery] = useState("")
  const [bookings, setBookings] = useState<Booking[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [error, setError] = useState("")
  const [mobileView, setMobileView] = useState<"list" | "grid">("list")
  const [showSidebar, setShowSidebar] = useState(false)
  const [schedule, setSchedule] = useState<ScheduleDay[]>([])
  const [reservationViewMode, setReservationViewMode] = useState<"queue" | "confirmed">("queue")
  
  // Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false)
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)

  const dateStr = useMemo(() => format(selectedDate, "yyyy-MM-dd"), [selectedDate])

  const loadData = async () => {
    try {
      setError("")
      const [tablesData, bookingsData, scheduleData] = await Promise.all([
        adminApi.getTables(dateStr),
        adminApi.getReservations(dateStr, searchQuery || undefined),
        adminApi.getSchedule(),
      ])
      setTables(tablesData as Table[])
      setBookings(bookingsData as Booking[])
      setSchedule(scheduleData as ScheduleDay[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные")
    }
  }

  useEffect(() => {
    void loadData()
  }, [dateStr, searchQuery])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const dateParam = params.get("date")
    const viewParam = params.get("view")
    if (dateParam) {
      setSelectedDate(new Date(`${dateParam}T00:00:00`))
    }
    if (viewParam === "confirmed" || viewParam === "queue") {
      setReservationViewMode(viewParam)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || bookings.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const reservationId = params.get("reservationId")
    if (!reservationId) return
    const booking = bookings.find((item) => item.id === reservationId)
    if (!booking) return
    setSelectedBooking(booking)
    setIsEditModalOpen(true)
  }, [bookings])

  const clearReservationParams = () => {
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    url.searchParams.delete("reservationId")
    url.searchParams.delete("date")
    url.searchParams.delete("view")
    window.history.replaceState({}, "", url.toString())
  }

  const filteredBookings = bookings.filter((b) => {
    const matchesDate = b.date === dateStr
    const matchesSearch = searchQuery === "" ||
      b.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.phone.includes(searchQuery)
    return matchesDate && matchesSearch
  })

  const pendingBookings = filteredBookings.filter(b => b.status === "pending")
  const cancelledBookings = filteredBookings.filter(b => b.status === "cancelled")
  const confirmedBookings = filteredBookings
    .filter(b => b.status === "confirmed")
    .sort((a, b) => a.time.localeCompare(b.time))
  const visibleBookings = reservationViewMode === "confirmed"
    ? confirmedBookings
    : filteredBookings.filter((b) => b.status === "pending" || b.status === "cancelled")

  const handleEditBooking = (booking: Booking) => {
    setSelectedBooking(booking)
    setIsEditModalOpen(true)
  }

  const handleBlockTable = (table: Table) => {
    setSelectedTable(table)
    setIsBlockModalOpen(true)
  }

  const handleSaveBooking = (updatedBooking: Booking) => {
    setBookings((prev) => prev.map((b) => (b.id === updatedBooking.id ? updatedBooking : b)))
    setIsEditModalOpen(false)
    setSelectedBooking(null)
  }

  const handleConfirmBooking = (updatedBooking: Booking) => {
    setBookings((prev) => prev.map((b) => (b.id === updatedBooking.id ? updatedBooking : b)))
    setSelectedBooking(null)
    setIsEditModalOpen(false)
  }

  const handleCancelBooking = (updatedBooking: Booking) => {
    setBookings((prev) => prev.map((b) => (b.id === updatedBooking.id ? updatedBooking : b)))
    setSelectedBooking(null)
    setIsEditModalOpen(false)
  }

  const handleDeleteBooking = (bookingId: string) => {
    setBookings((prev) => prev.filter((b) => b.id !== bookingId))
    setSelectedBooking(null)
    setIsEditModalOpen(false)
  }

  const handleRestoreBooking = (updatedBooking: Booking) => {
    setBookings((prev) => prev.map((b) => (b.id === updatedBooking.id ? updatedBooking : b)))
    setSelectedBooking(null)
    setIsEditModalOpen(false)
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
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        onAnalyticsClick={() => setIsAnalyticsModalOpen(true)}
        onManageTablesClick={() => router.push("/admin/settings?tab=tables")}
        onManageScheduleClick={() => router.push("/admin/settings?tab=schedule")}
        onManageTelegramClick={() => router.push("/admin/settings?tab=telegram")}
        onRefreshClick={() => void loadData()}
        pendingCount={pendingBookings.length}
        onToggleSidebar={() => setShowSidebar(!showSidebar)}
      />
      
      {/* Mobile view toggle */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2 lg:hidden">
        <div className="flex gap-1">
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
        <span className="text-xs text-muted-foreground">
          {visibleBookings.length} бронирований
        </span>
      </div>
      
      <div className="flex flex-1">
        {/* Sidebar - hidden on mobile unless toggled */}
        <div className={cn(
          "fixed inset-y-0 left-0 z-40 w-80 transform bg-card transition-transform duration-300 lg:relative lg:translate-x-0",
          showSidebar ? "translate-x-0" : "-translate-x-full"
        )}>
          <AdminSidebar
            pendingBookings={pendingBookings}
            confirmedBookings={confirmedBookings}
            cancelledBookings={cancelledBookings}
            viewMode={reservationViewMode}
            onViewModeChange={setReservationViewMode}
            tables={tables}
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
        
        {/* Overlay for mobile sidebar */}
        {showSidebar && (
          <div 
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setShowSidebar(false)}
          />
        )}
        
        {/* Main content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {/* Mobile list view */}
          {mobileView === "list" && (
            <div className="space-y-2 lg:hidden">
              {visibleBookings.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  Нет бронирований на выбранную дату
                </div>
              ) : (
                visibleBookings
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((booking) => {
                    const tableLabel =
                      booking.table_ids && booking.table_ids.length > 1
                        ? booking.table_ids
                            .map((id) => tables.find((table) => table.id === id)?.name || `#${id}`)
                            .join(" + ")
                        : tables.find((table) => table.id === booking.tableId)?.name
                    return (
                      <button
                        key={booking.id}
                        onClick={() => handleEditBooking(booking)}
                        className={cn(
                          "w-full rounded-xl border-l-4 p-4 text-left transition-colors",
                          booking.color
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">
                              {booking.firstName} {booking.lastName}
                            </div>
                            <div className="mt-0.5 text-sm text-muted-foreground">
                              {booking.time} - {booking.endTime}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">{tableLabel}</div>
                            <div className="text-xs text-muted-foreground">
                              {booking.guests} гостей
                            </div>
                          </div>
                        </div>
                        {booking.note && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            {booking.note}
                          </div>
                        )}
                      </button>
                    )
                  })
              )}
            </div>
          )}
          
          {/* Mobile grid view & Desktop view */}
          <div className={cn(
            mobileView === "grid" ? "block" : "hidden lg:block"
          )}>
            <TablesGrid
              tables={tables}
              bookings={visibleBookings}
              onEditBooking={handleEditBooking}
              onBlockTable={handleBlockTable}
            />
          </div>
        </main>
      </div>

      {/* Mobile FAB */}
      <Button
        onClick={openCreateBookingPage}
        className="fixed bottom-6 right-6 z-20 h-14 w-14 rounded-full bg-lime-400 shadow-lg hover:bg-lime-500 lg:hidden"
        size="icon"
      >
        <Plus className="h-6 w-6 text-foreground" />
      </Button>

      <EditBookingModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setSelectedBooking(null)
          clearReservationParams()
        }}
        booking={selectedBooking}
        onSave={handleSaveBooking}
        onConfirm={handleConfirmBooking}
        onCancel={handleCancelBooking}
        onRestore={handleRestoreBooking}
        onDelete={handleDeleteBooking}
      />

      <BlockTableModal
        isOpen={isBlockModalOpen}
        onClose={() => {
          setIsBlockModalOpen(false)
          setSelectedTable(null)
        }}
        table={selectedTable}
        onSuccess={() => void loadData()}
      />

      <AnalyticsModal
        isOpen={isAnalyticsModalOpen}
        onClose={() => setIsAnalyticsModalOpen(false)}
        bookings={bookings}
      />
    </div>
  )
}
