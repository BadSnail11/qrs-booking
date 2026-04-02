"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { ArrowLeft, CalendarIcon, AlertTriangle, Users, X, Check, Phone, Mail, MessageSquare, UtensilsCrossed, Timer } from "lucide-react"
import type { Booking, ScheduleDay, Table } from "@/app/admin/page"
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
import { partySizeOptions, setCountOptions } from "@/lib/booking-limits"

type TableOption = {
  key: string
  label: string
  tableIds: number[]
  capacity: number
}

const ADMIN_BOOKING_DRAFT_KEY = "qrs-admin-booking-draft"

type AdminBookingDraft = {
  date: string | null
  formData: {
    firstName: string
    lastName: string
    phone: string
    email: string
    guests: string
    sets: string
    time: string
    tableOptionKey: string
    note: string
  }
}

export function AdminCreateReservationPageClient({
  initialDate,
  initialView,
}: {
  initialDate?: string
  initialView: "queue" | "confirmed"
}) {
  const [date, setDate] = useState<Date | undefined>(() =>
    initialDate ? new Date(`${initialDate}T00:00:00`) : new Date()
  )
  const [tables, setTables] = useState<Table[]>([])
  const [schedule, setSchedule] = useState<ScheduleDay[]>([])
  const [existingBookings, setExistingBookings] = useState<Booking[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [submitError, setSubmitError] = useState("")
  const [pageError, setPageError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [warningMessage, setWarningMessage] = useState("")
  const [conflictingBooking, setConflictingBooking] = useState<Booking | null>(null)
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
    if (dateValue) params.set("date", dateValue)
    params.set("view", initialView)
    return `/admin?${params.toString()}`
  }, [dateValue, initialView])

  const loadData = async (targetDate: string) => {
    setIsLoading(true)
    setPageError("")
    try {
      const [tablesData, bookingsData, scheduleData] = await Promise.all([
        adminApi.getTables(targetDate),
        adminApi.getReservations(targetDate),
        adminApi.getSchedule(),
      ])
      setTables(tablesData as Table[])
      setExistingBookings(bookingsData as Booking[])
      setSchedule(scheduleData as ScheduleDay[])
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Не удалось загрузить данные")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!dateValue) return
    void loadData(dateValue)
  }, [dateValue])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const rawDraft = window.localStorage.getItem(ADMIN_BOOKING_DRAFT_KEY)
      if (!rawDraft) return
      const draft = JSON.parse(rawDraft) as AdminBookingDraft
      setFormData(draft.formData)
      if (draft.date) {
        setDate(new Date(`${draft.date}T00:00:00`))
      }
    } catch {
      window.localStorage.removeItem(ADMIN_BOOKING_DRAFT_KEY)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const draft: AdminBookingDraft = {
      date: date ? format(date, "yyyy-MM-dd") : null,
      formData,
    }
    window.localStorage.setItem(ADMIN_BOOKING_DRAFT_KEY, JSON.stringify(draft))
  }, [date, formData])

  const activeTables = useMemo(
    () => tables.filter((table) => table.isActive !== false),
    [tables]
  )

  const selectedSchedule = useMemo(() => {
    if (!date) return null
    return schedule.find((day) => day.weekday === ((date.getDay() + 6) % 7)) || null
  }, [date, schedule])

  const availableTimeSlots = useMemo(() => {
    if (!selectedSchedule?.isOpen || !selectedSchedule.openTime || !selectedSchedule.closeTime) {
      return []
    }

    const [openHour, openMinute] = selectedSchedule.openTime.split(":").map(Number)
    const [closeHour, closeMinute] = selectedSchedule.closeTime.split(":").map(Number)
    const slots: string[] = []
    let totalMinutes = openHour * 60 + openMinute
    const endMinutes = closeHour * 60 + closeMinute

    while (totalMinutes <= endMinutes) {
      const hours = Math.floor(totalMinutes / 60)
      const minutes = totalMinutes % 60
      slots.push(`${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`)
      totalMinutes += 30
    }

    return slots
  }, [selectedSchedule])

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

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

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
    }) as {
      ok: boolean
      capacity_issue: boolean
      conflict: { customer_name: string; phone: string; reservation_time: string } | null
      block: { start_time: string; end_time: string; reason: string } | null
      unite_issue?: boolean
    }

    if (result.capacity_issue) {
      return {
        message: `${optionLabel} не подходит по вместимости для ${formData.guests} гостей`,
        booking: null,
      }
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
      return {
        message: `${optionLabel} заблокирован: ${result.block.reason || "без причины"}`,
        booking: null,
      }
    }

    if (result.unite_issue) {
      return {
        message: `${optionLabel} не может быть объединен по текущим правилам`,
        booking: null,
      }
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

  const saveBooking = async (force = false) => {
    if (!date || !selectedOption) return
    setIsSaving(true)
    setSubmitError("")
    try {
      await adminApi.createReservation({
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        email: formData.email || undefined,
        guests: parseInt(formData.guests, 10),
        sets: parseInt(formData.sets || "1", 10),
        date: dateValue,
        time: formData.time,
        table_ids: selectedOption.tableIds,
        note: formData.note || undefined,
        force,
      })
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(ADMIN_BOOKING_DRAFT_KEY)
      }
      window.location.href = backHref
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось создать бронь")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!date || !selectedOption) return
    setSubmitError("")
    const issue = await checkTableAvailability(selectedOption.tableIds, selectedOption.label)
    if (issue) {
      setWarningMessage(issue.message)
      setConflictingBooking(issue.booking)
      setShowWarning(true)
      return
    }
    await saveBooking()
  }

  const getOptionStatus = (option: TableOption) => {
    if (!formData.time || !formData.guests || !date) return "available"

    const guests = parseInt(formData.guests, 10)
    if (guests > option.capacity) return "capacity-issue"

    const conflict = existingBookings.find((booking) => {
      if (booking.status === "cancelled" || booking.date !== dateValue) return false
      const bookingTableIds = booking.table_ids && booking.table_ids.length > 0 ? booking.table_ids : [booking.tableId]
      if (!bookingTableIds.some((id) => option.tableIds.includes(id))) return false
      const bookingStart = booking.time
      const bookingEnd = booking.endTime
      const newStart = formData.time
      const newEnd = getEndTime(formData.time)
      return newStart < bookingEnd && newEnd > bookingStart
    })

    if (conflict) return "booked"
    return "available"
  }

  return (
    <>
      <div className="min-h-screen bg-muted/30">
        <div className="border-b bg-card">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 lg:px-6">
            <div className="flex items-center gap-3">
              <Button asChild variant="outline" size="icon">
                <Link href={backHref}>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-semibold">Создать бронирование</h1>
                <p className="text-sm text-muted-foreground">Отдельная страница для брони администратора</p>
              </div>
            </div>
          </div>
        </div>

        <main className="mx-auto max-w-5xl p-4 lg:p-6">
          {pageError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {pageError}
            </div>
          )}

          <div className="rounded-3xl border border-border bg-card p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Личные данные
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">Имя</Label>
                    <Input id="firstName" value={formData.firstName} onChange={(e) => handleInputChange("firstName", e.target.value)} placeholder="Иван" required className="h-12 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName">Фамилия</Label>
                    <Input id="lastName" value={formData.lastName} onChange={(e) => handleInputChange("lastName", e.target.value)} placeholder="Иванов" required className="h-12 rounded-xl" />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Телефон</Label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                      <Input id="phone" value={formData.phone} onChange={(e) => handleInputChange("phone", e.target.value)} placeholder="+7 999 123-45-67" required className="h-12 rounded-xl pl-11" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                      <Input id="email" value={formData.email} onChange={(e) => handleInputChange("email", e.target.value)} placeholder="ivan@example.com" className="h-12 rounded-xl pl-11" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-4">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Детали бронирования
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label>Гости</Label>
                    <Select value={formData.guests} onValueChange={(value) => setFormData((prev) => ({ ...prev, guests: value, tableOptionKey: "" }))}>
                      <SelectTrigger className="h-12 rounded-xl">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground/50" />
                          <SelectValue placeholder="Кол-во" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {partySizeOptions.map((value) => (
                          <SelectItem key={value} value={value}>{value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Сеты</Label>
                    <Select value={formData.sets} onValueChange={(value) => handleInputChange("sets", value)}>
                      <SelectTrigger className="h-12 rounded-xl">
                        <div className="flex items-center gap-2">
                          <UtensilsCrossed className="h-4 w-4 text-muted-foreground/50" />
                          <SelectValue placeholder="Кол-во" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {setCountOptions.map((value) => (
                          <SelectItem key={value} value={value}>{value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5 lg:col-span-2">
                    <Label>Дата</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("h-12 w-full justify-start rounded-xl text-left font-normal", !date && "text-muted-foreground/50")}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground/50" />
                          {date ? format(date, "d MMMM yyyy", { locale: ru }) : "Выберите дату"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={(value) => {
                            setDate(value)
                            setFormData((prev) => ({ ...prev, time: "", tableOptionKey: "" }))
                          }}
                          locale={ru}
                          disabled={(day) => day < new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Время начала</Label>
                    <span className="flex items-center gap-1 text-[10px] text-primary">
                      <Timer className="h-3 w-3" />
                      2 часа
                    </span>
                  </div>
                  <Select value={formData.time} onValueChange={(value) => setFormData((prev) => ({ ...prev, time: value, tableOptionKey: "" }))}>
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue placeholder="Выбрать время" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTimeSlots.map((time) => (
                        <SelectItem key={time} value={time}>{time}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {date && selectedSchedule?.isOpen === false && (
                    <div className="text-xs text-destructive">В выбранный день бронирование закрыто</div>
                  )}
                  {selectedSchedule?.isOpen && selectedSchedule.openTime && selectedSchedule.closeTime && (
                    <div className="text-xs text-muted-foreground">
                      График на день: {selectedSchedule.openTime} - {selectedSchedule.closeTime}
                    </div>
                  )}
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-4">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Выбор стола
                </div>
                {isLoading ? (
                  <div className="rounded-xl border border-dashed border-border bg-background px-4 py-6 text-sm text-muted-foreground">
                    Загрузка столов...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
                )}
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Примечание</span>
                </div>
                <Textarea value={formData.note} onChange={(e) => handleInputChange("note", e.target.value)} placeholder="Особые пожелания..." className="min-h-[120px] resize-none rounded-xl" />
              </div>

              {submitError && <div className="text-sm text-destructive">{submitError}</div>}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href={backHref}>Отмена</Link>
                </Button>
                <Button type="submit" disabled={isSaving} className="rounded-xl">
                  {isSaving ? "Создание..." : "Создать бронь"}
                </Button>
              </div>
            </form>
          </div>
        </main>
      </div>

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
              <div className="mt-4">
                Вы точно хотите создать эту бронь?
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => void saveBooking(true)}>
              Всё равно создать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
