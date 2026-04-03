"use client"

import { useMemo, useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarIcon, AlertTriangle, Users, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { adminSetSelectItems, partySizeOptions } from "@/lib/booking-limits"
import type { Booking, ScheduleDay, Table } from "@/app/admin/page"
import { adminApi } from "@/lib/api"

interface BookingModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (booking: Booking) => void
  tables: Table[]
  schedule: ScheduleDay[]
  existingBookings: Booking[]
}

export function BookingModal({
  isOpen,
  onClose,
  onSave,
  tables,
  schedule,
  existingBookings,
}: BookingModalProps) {
  type TableOption = {
    key: string
    label: string
    tableIds: number[]
    capacity: number
  }

  const [date, setDate] = useState<Date>()
  const [showWarning, setShowWarning] = useState(false)
  const [warningMessage, setWarningMessage] = useState("")
  const [conflictingBooking, setConflictingBooking] = useState<Booking | null>(null)
  const [submitError, setSubmitError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  
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
  const dateValue = date ? format(date, "yyyy-MM-dd") : ""

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

  const handleSubmit = async () => {
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

  const saveBooking = async (force = false) => {
    if (!date) return
    setIsSaving(true)
    setSubmitError("")
    try {
      const booking = await adminApi.createReservation({
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        email: formData.email || undefined,
        guests: parseInt(formData.guests, 10),
        sets: parseInt(formData.sets || "1", 10),
        date: dateValue,
        time: formData.time,
        table_ids: selectedOption?.tableIds,
        note: formData.note || undefined,
        force,
      }) as Booking

      onSave(booking)
      setFormData({
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
      setDate(undefined)
      setShowWarning(false)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось создать бронь")
    } finally {
      setIsSaving(false)
    }
  }

  const getOptionStatus = (option: TableOption) => {
    if (!formData.time || !formData.guests || !date) return "available"
    
    const guests = parseInt(formData.guests)
    if (guests > option.capacity) return "capacity-issue"
    
    const dateStr = dateValue
    const conflict = existingBookings.find(b => {
      if (b.status === "cancelled" || b.date !== dateStr) return false
      const bookingTableIds = b.table_ids && b.table_ids.length > 0 ? b.table_ids : [b.tableId]
      if (!bookingTableIds.some((id) => option.tableIds.includes(id))) return false
      const bookingStart = b.time
      const bookingEnd = b.endTime
      const newStart = formData.time
      const newEnd = getEndTime(formData.time)
      return (newStart < bookingEnd && newEnd > bookingStart)
    })

    if (conflict) return "booked"
    return "available"
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Создать бронирование</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Personal Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Личные данные</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Имя</Label>
                  <Input
                    value={formData.firstName}
                    onChange={(e) => handleInputChange("firstName", e.target.value)}
                    placeholder="Иван"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Фамилия (необязательно)</Label>
                  <Input
                    value={formData.lastName}
                    onChange={(e) => handleInputChange("lastName", e.target.value)}
                    placeholder="Иванов"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Телефон</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    placeholder="+7 999 123-45-67"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email (необязательно)</Label>
                  <Input
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    placeholder="ivan@example.com"
                  />
                </div>
              </div>
            </div>

            {/* Booking Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Детали бронирования</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Гости</Label>
                  <Select value={formData.guests} onValueChange={(v) => handleInputChange("guests", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Кол-во" />
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
                      <SelectValue placeholder="Кол-во" />
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
                <div className="space-y-2">
                  <Label>Время</Label>
                  <Select value={formData.time} onValueChange={(v) => handleInputChange("time", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выбрать" />
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
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Дата</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                      )}
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
                        setFormData((prev) => ({ ...prev, time: "" }))
                      }}
                      locale={ru}
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Table Selection */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Выбор стола</h3>
              <div className="grid grid-cols-4 gap-2">
                {tableOptions.map((option) => {
                  const status = getOptionStatus(option)
                  const isSelected = formData.tableOptionKey === option.key
                  
                  return (
                    <button
                      key={option.key}
                      onClick={() => void handleTableSelect(option.key)}
                      className={cn(
                        "relative rounded-lg border-2 p-3 text-left transition-colors",
                        isSelected && "border-primary bg-primary/5",
                        !isSelected && status === "available" && "border-border hover:border-primary/50",
                        !isSelected && status === "capacity-issue" && "border-orange-300 bg-orange-50",
                        !isSelected && status === "booked" && "border-red-300 bg-red-50"
                      )}
                    >
                      {isSelected && (
                        <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />
                      )}
                      <div className="font-medium">{option.label}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        до {option.capacity}
                      </div>
                      {status === "capacity-issue" && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-orange-600">
                          <AlertTriangle className="h-3 w-3" />
                          Мало мест
                        </div>
                      )}
                      {status === "booked" && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-red-600">
                          <X className="h-3 w-3" />
                          Занят
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label>Примечание (необязательно)</Label>
              <Textarea
                value={formData.note}
                onChange={(e) => handleInputChange("note", e.target.value)}
                placeholder="Особые пожелания..."
                className="resize-none"
              />
            </div>
          </div>

          {submitError && <div className="text-sm text-destructive">{submitError}</div>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={isSaving}>
              Создать бронь
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Warning Dialog */}
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
