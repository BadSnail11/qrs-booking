"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { ArrowLeft, CalendarIcon, AlertTriangle, Users, X, Check } from "lucide-react"
import type { Booking, Table } from "@/app/admin/page"
import { adminApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { adminSetSelectItems, partySizeOptions } from "@/lib/booking-limits"
import { ReservationStatusBadge } from "@/components/admin/reservation-status-badge"

const timeSlots = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30", "22:00",
]

type TableOption = {
  key: string
  label: string
  tableIds: number[]
  capacity: number
}

type PendingAction = "save" | "confirm" | "cancel" | null

export function AdminEditReservationPageClient({
  reservationId,
  initialDate,
  initialView,
}: {
  reservationId: string
  initialDate?: string
  initialView: "queue" | "confirmed"
}) {
  const [booking, setBooking] = useState<Booking | null>(null)
  const [tables, setTables] = useState<Table[]>([])
  const [existingBookings, setExistingBookings] = useState<Booking[]>([])
  const [date, setDate] = useState<Date>()
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [showWarning, setShowWarning] = useState(false)
  const [warningMessage, setWarningMessage] = useState("")
  const [conflictingBooking, setConflictingBooking] = useState<Booking | null>(null)
  const [submitError, setSubmitError] = useState("")
  const [pageError, setPageError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    guests: "",
    sets: "",
    time: "",
    tableOptionKey: "",
    note: "",
  })
  const dateValue = useMemo(() => (date ? format(date, "yyyy-MM-dd") : ""), [date])

  const backHref = useMemo(() => {
    const params = new URLSearchParams()
    if (initialDate) params.set("date", initialDate)
    params.set("view", initialView)
    return `/admin?${params.toString()}`
  }, [initialDate, initialView])

  useEffect(() => {
    const loadReservation = async () => {
      setIsLoading(true)
      setPageError("")
      try {
        const targetDate = initialDate || format(new Date(), "yyyy-MM-dd")
        const [bookings, tablesData] = await Promise.all([
          adminApi.getReservations(targetDate),
          adminApi.getTables(targetDate),
        ])
        const matched = (bookings as Booking[]).find((item) => item.id === reservationId)
        if (!matched) {
          setPageError("Бронирование не найдено")
          return
        }
        setExistingBookings(bookings as Booking[])
        setTables(tablesData as Table[])
        setBooking(matched)
        setFormData({
          firstName: matched.firstName,
          lastName: matched.lastName,
          phone: matched.phone,
          email: matched.email || "",
          guests: String(matched.guests),
          sets: String(matched.sets),
          time: matched.time,
          tableOptionKey:
            matched.table_ids && matched.table_ids.length > 1
              ? `pair-${[...matched.table_ids].sort((a, b) => a - b).join("-")}`
              : `single-${matched.tableId}`,
          note: matched.note || "",
        })
        setDate(new Date(`${matched.date}T00:00:00`))
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "Не удалось загрузить бронирование")
      } finally {
        setIsLoading(false)
      }
    }

    void loadReservation()
  }, [initialDate, reservationId])

  useEffect(() => {
    const loadDayData = async () => {
      if (!dateValue) return
      try {
        const [bookings, tablesData] = await Promise.all([
          adminApi.getReservations(dateValue),
          adminApi.getTables(dateValue),
        ])
        setExistingBookings(bookings as Booking[])
        setTables(tablesData as Table[])
      } catch {
        // noop
      }
    }

    if (!booking || !dateValue) return
    void loadDayData()
  }, [booking, dateValue])

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const activeTables = useMemo(
    () => tables.filter((table) => table.isActive !== false),
    [tables]
  )

  const tableOptions = useMemo<TableOption[]>(() => {
    const singles: TableOption[] = activeTables.map((table) => ({
      key: `single-${table.id}`,
      label: table.name,
      tableIds: [table.id],
      capacity: table.maxCapacity,
    }))

    const seenPairs = new Set<string>()
    const pairs: TableOption[] = []
    activeTables.forEach((table) => {
      if (!table.canUnite || !table.uniteWithTableId) return
      const partner = activeTables.find((candidate) => candidate.id === table.uniteWithTableId)
      if (!partner) return
      const pairIds = [table.id, partner.id].sort((a, b) => a - b)
      const pairKey = `pair-${pairIds.join("-")}`
      if (seenPairs.has(pairKey)) return
      seenPairs.add(pairKey)
      pairs.push({
        key: pairKey,
        label: `${table.name} + ${partner.name}`,
        tableIds: pairIds,
        capacity: table.maxCapacity + partner.maxCapacity,
      })
    })

    return [...singles, ...pairs]
  }, [activeTables])

  const selectedOption = tableOptions.find((option) => option.key === formData.tableOptionKey)

  const getEndTime = (startTime: string): string => {
    const [hours, minutes] = startTime.split(":").map(Number)
    const endHours = hours + 2
    return `${String(endHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
  }

  const checkTableAvailability = async (tableIds: number[], optionLabel: string) => {
    if (!date || !formData.time || !formData.guests) return null

    const result = await adminApi.checkTable({
      table_ids: tableIds,
      guests: parseInt(formData.guests, 10),
      date: dateValue,
      time: formData.time,
      reservation_id: booking?.id,
    }) as {
      ok: boolean
      capacity_issue: boolean
      conflict: { customer_name: string; phone: string; reservation_time: string } | null
      block: { start_time: string; end_time: string; reason: string } | null
      unite_issue?: boolean
    }

    if (result.capacity_issue) {
      return { message: `${optionLabel} не подходит по вместимости для ${formData.guests} гостей`, booking: null }
    }

    if (result.conflict) {
      const [firstName, ...rest] = result.conflict.customer_name.split(" ")
      return {
        message: `${optionLabel} уже занят другой бронью`,
        booking: {
          id: "conflict",
          firstName,
          lastName: rest.join(" "),
          phone: result.conflict.phone || "",
          guests: parseInt(formData.guests, 10),
          sets: 1,
          date: dateValue,
          time: formData.time,
          endTime: getEndTime(formData.time),
          tableId: tableIds[0],
          status: "confirmed",
          color: "bg-red-100 border-l-red-400",
        } as Booking,
      }
    }

    if (result.block) {
      return { message: `${optionLabel} заблокирован: ${result.block.reason || "без причины"}`, booking: null }
    }

    if (result.unite_issue) {
      return { message: `${optionLabel} не может быть объединен по текущим правилам`, booking: null }
    }

    return null
  }

  const handleTableSelect = async (optionKey: string) => {
    handleInputChange("tableOptionKey", optionKey)
    const option = tableOptions.find((item) => item.key === optionKey)
    if (!option) return
    if (formData.time && formData.guests && date) {
      const issue = await checkTableAvailability(option.tableIds, option.label)
      if (issue) {
        setWarningMessage(issue.message)
        setConflictingBooking(issue.booking)
        setShowWarning(true)
      }
    }
  }

  const getOptionStatus = (option: TableOption) => {
    if (!formData.time || !formData.guests || !date) return "available"

    const guests = parseInt(formData.guests, 10)
    if (guests > option.capacity) return "capacity-issue"

    const conflict = existingBookings.find((item) => {
      if (item.id === booking?.id || item.status === "cancelled" || item.date !== dateValue) return false
      const bookingTableIds = item.table_ids && item.table_ids.length > 0 ? item.table_ids : [item.tableId]
      if (!bookingTableIds.some((id) => option.tableIds.includes(id))) return false
      const bookingStart = item.time
      const bookingEnd = item.endTime
      const newStart = formData.time
      const newEnd = getEndTime(formData.time)
      return newStart < bookingEnd && newEnd > bookingStart
    })

    if (conflict) return "booked"
    return "available"
  }

  const handleSave = () => {
    if (!formData.tableOptionKey) {
      setSubmitError("Выберите стол для бронирования")
      return
    }
    setPendingAction("save")
    setShowConfirmation(true)
  }

  const confirmSave = async () => {
    if (!booking || !date) return

    setSubmitError("")
    try {
      const updated = await adminApi.updateReservation(booking.id, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        email: formData.email || undefined,
        guests: parseInt(formData.guests, 10),
        sets: parseInt(formData.sets, 10),
        date: format(date, "yyyy-MM-dd"),
        time: formData.time,
        note: formData.note || undefined,
        table_ids: selectedOption?.tableIds || booking.table_ids || [booking.tableId],
        confirm_call_notice: true,
      }) as Booking
      setBooking(updated)
      setShowConfirmation(false)
      window.location.href = backHref
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось сохранить изменения")
    }
  }

  const handleConfirmReservation = async () => {
    if (!booking || booking.status !== "pending") return
    setSubmitError("")
    try {
      await adminApi.confirmReservation(booking.id)
      window.location.href = backHref
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось подтвердить бронь")
    }
  }

  const handleCancelReservation = async () => {
    if (!booking || booking.status === "cancelled") return
    setSubmitError("")
    try {
      await adminApi.cancelReservation(booking.id)
      window.location.href = backHref
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось отменить бронь")
    }
  }

  const handleDeleteReservation = async () => {
    if (!booking || booking.status !== "cancelled") return
    setSubmitError("")
    try {
      await adminApi.deleteReservation(booking.id)
      window.location.href = backHref
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось удалить бронь")
    }
  }

  const handleRestoreReservation = async () => {
    if (!booking || booking.status !== "cancelled") return
    setSubmitError("")
    try {
      await adminApi.restoreReservation(booking.id)
      window.location.href = backHref
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось вернуть бронь в ожидание")
    }
  }

  const actionConfirmationText: Record<Exclude<PendingAction, null>, string> = {
    save: "Сохранить изменения бронирования?",
    confirm: "Подтвердить это бронирование?",
    cancel: "Отменить это бронирование?",
  }

  const confirmPendingAction = async () => {
    if (!pendingAction) return
    if (pendingAction === "save") {
      await confirmSave()
      return
    }
    if (pendingAction === "confirm") {
      await handleConfirmReservation()
      return
    }
    await handleCancelReservation()
  }

  return (
    <>
      <div className="min-h-screen bg-muted/30">
        <div className="border-b bg-card">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 lg:px-6">
            <div className="flex items-center gap-3">
              <Button asChild variant="outline" size="icon">
                <Link href={backHref}>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-semibold">Редактировать бронирование</h1>
                <p className="text-sm text-muted-foreground">Отдельная страница редактирования</p>
              </div>
            </div>
            {booking && <ReservationStatusBadge status={booking.status} />}
          </div>
        </div>

        <main className="mx-auto max-w-3xl p-4 lg:p-6">
          {pageError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {pageError}
            </div>
          )}

          {!pageError && (
            <div className="rounded-3xl border border-border bg-card p-6">
              {isLoading || !booking ? (
                <div className="text-sm text-muted-foreground">Загрузка бронирования...</div>
              ) : (
                <>
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Имя</Label>
                        <Input value={formData.firstName} onChange={(e) => handleInputChange("firstName", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Фамилия (необязательно)</Label>
                        <Input value={formData.lastName} onChange={(e) => handleInputChange("lastName", e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Телефон</Label>
                        <Input value={formData.phone} onChange={(e) => handleInputChange("phone", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input value={formData.email} onChange={(e) => handleInputChange("email", e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Гости</Label>
                        <Select value={formData.guests} onValueChange={(v) => setFormData((prev) => ({ ...prev, guests: v, tableOptionKey: "" }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {partySizeOptions.map((n) => (
                              <SelectItem key={n} value={n}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Сеты</Label>
                        <Select value={formData.sets} onValueChange={(v) => handleInputChange("sets", v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {adminSetSelectItems.map(({ value, label }) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Дата</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date ? format(date, "d MMMM yyyy", { locale: ru }) : "Выберите дату"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={date}
                            onSelect={(value) => {
                              setDate(value)
                              setFormData((prev) => ({ ...prev, tableOptionKey: "" }))
                            }}
                            locale={ru}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Время</Label>
                      <Select value={formData.time} onValueChange={(v) => setFormData((prev) => ({ ...prev, time: v, tableOptionKey: "" }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {timeSlots.map((time) => (
                            <SelectItem key={time} value={time}>{time}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-4">
                      <Label>Стол</Label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {tableOptions.map((option) => {
                          const status = getOptionStatus(option)
                          const isSelected = formData.tableOptionKey === option.key

                          return (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => void handleTableSelect(option.key)}
                              className={cn(
                                "relative rounded-xl border-2 p-4 text-left transition-colors",
                                isSelected && "border-primary bg-primary/5",
                                !isSelected && status === "available" && "border-border hover:border-primary/50",
                                !isSelected && status === "capacity-issue" && "border-orange-300 bg-orange-50",
                                !isSelected && status === "booked" && "border-red-300 bg-red-50"
                              )}
                            >
                              {isSelected && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" />}
                              <div className="font-medium">{option.label}</div>
                              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                <Users className="h-3 w-3" />
                                до {option.capacity}
                              </div>
                              {status === "capacity-issue" && (
                                <div className="mt-2 flex items-center gap-1 text-xs text-orange-600">
                                  <AlertTriangle className="h-3 w-3" />
                                  Мало мест
                                </div>
                              )}
                              {status === "booked" && (
                                <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
                                  <X className="h-3 w-3" />
                                  Занят
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Примечание</Label>
                      <Textarea value={formData.note} onChange={(e) => handleInputChange("note", e.target.value)} className="resize-none" />
                    </div>
                  </div>

                  {submitError && <div className="mt-4 text-sm text-destructive">{submitError}</div>}

                  <div className="mt-6 flex flex-wrap justify-end gap-2">
                    {booking.status !== "cancelled" && (
                      <Button
                        onClick={() => {
                          setPendingAction("cancel")
                          setShowConfirmation(true)
                        }}
                        variant="destructive"
                      >
                        Отменить
                      </Button>
                    )}
                    {booking.status === "pending" && (
                      <Button
                        onClick={() => {
                          setPendingAction("confirm")
                          setShowConfirmation(true)
                        }}
                        variant="secondary"
                      >
                        Подтвердить
                      </Button>
                    )}
                    {booking.status === "cancelled" && (
                      <Button onClick={() => void handleRestoreReservation()} variant="secondary">
                        Вернуть в ожидание
                      </Button>
                    )}
                    {booking.status === "cancelled" && (
                      <Button onClick={() => void handleDeleteReservation()} variant="destructive">
                        Удалить
                      </Button>
                    )}
                    <Button asChild variant="outline">
                      <Link href={backHref}>Отмена</Link>
                    </Button>
                    <Button onClick={handleSave} disabled={booking.status === "cancelled"}>
                      Сохранить
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>

      <AlertDialog
        open={showConfirmation}
        onOpenChange={(open) => {
          setShowConfirmation(open)
          if (!open) setPendingAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердите действие</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction ? actionConfirmationText[pendingAction] : "Вы уверены?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Нет</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmPendingAction()}>
              Да
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Внимание
            </AlertDialogTitle>
            <AlertDialogDescription>
              {warningMessage}
              {conflictingBooking && (
                <div className="mt-2 rounded-lg bg-muted p-3 text-sm">
                  <div className="font-medium">Существующая бронь:</div>
                  <div>{conflictingBooking.firstName} {conflictingBooking.lastName}</div>
                  <div>{conflictingBooking.time} - {conflictingBooking.endTime}</div>
                  <div>{conflictingBooking.phone}</div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Закрыть</AlertDialogCancel>
            <AlertDialogAction>Понятно</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
