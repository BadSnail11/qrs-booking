"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarIcon, Phone as PhoneIcon } from "lucide-react"
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
import type { Booking } from "@/app/admin/page"
import { adminApi } from "@/lib/api"
import { ReservationStatusBadge } from "@/components/admin/reservation-status-badge"

interface EditBookingModalProps {
  isOpen: boolean
  onClose: () => void
  booking: Booking | null
  onSave: (booking: Booking) => void
  onConfirm?: (booking: Booking) => void
  onCancel?: (booking: Booking) => void
  onRestore?: (booking: Booking) => void
  onDelete?: (bookingId: string) => void
}

const timeSlots = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30", "22:00",
]

export function EditBookingModal({
  isOpen,
  onClose,
  booking,
  onSave,
  onConfirm,
  onCancel,
  onRestore,
  onDelete,
}: EditBookingModalProps) {
  const [date, setDate] = useState<Date>()
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    guests: "",
    sets: "",
    time: "",
    note: "",
  })

  useEffect(() => {
    if (booking) {
      setFormData({
        firstName: booking.firstName,
        lastName: booking.lastName,
        phone: booking.phone,
        email: booking.email || "",
        guests: String(booking.guests),
        sets: String(booking.sets),
        time: booking.time,
        note: booking.note || "",
      })
      setDate(new Date(booking.date))
    }
  }, [booking])

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const getEndTime = (startTime: string): string => {
    const [hours, minutes] = startTime.split(":").map(Number)
    const endHours = hours + 2
    return `${String(endHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
  }

  const handleSave = () => {
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
        tableId: booking.tableId,
        confirm_call_notice: true,
      }) as Booking
      onSave(updated)
      setShowConfirmation(false)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось сохранить изменения")
    }
  }

  const handleConfirmReservation = async () => {
    if (!booking || booking.status !== "pending") return
    setSubmitError("")
    try {
      const result = await adminApi.confirmReservation(booking.id)
      onConfirm?.(result.reservation as Booking)
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось подтвердить бронь")
    }
  }

  const handleCancelReservation = async () => {
    if (!booking || booking.status === "cancelled") return
    setSubmitError("")
    try {
      const result = await adminApi.cancelReservation(booking.id)
      onCancel?.(result.reservation as Booking)
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось отменить бронь")
    }
  }

  const handleDeleteReservation = async () => {
    if (!booking || booking.status !== "cancelled") return
    setSubmitError("")
    try {
      await adminApi.deleteReservation(booking.id)
      onDelete?.(booking.id)
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось удалить бронь")
    }
  }

  const handleRestoreReservation = async () => {
    if (!booking || booking.status !== "cancelled") return
    setSubmitError("")
    try {
      const result = await adminApi.restoreReservation(booking.id)
      onRestore?.(result.reservation as Booking)
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось вернуть бронь в ожидание")
    }
  }

  if (!booking) return null

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-8">
              <DialogTitle>Редактировать бронирование</DialogTitle>
              <ReservationStatusBadge status={booking.status} />
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {booking.table_ids && booking.table_ids.length > 0 && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                Назначенные столы: {booking.table_ids.join(" + ")}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Имя</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => handleInputChange("firstName", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Фамилия (необязательно)</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) => handleInputChange("lastName", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Телефон</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Гости</Label>
                <Select value={formData.guests} onValueChange={(v) => handleInputChange("guests", v)}>
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
                    onSelect={setDate}
                    locale={ru}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Время</Label>
              <Select value={formData.time} onValueChange={(v) => handleInputChange("time", v)}>
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

            <div className="space-y-2">
              <Label>Примечание</Label>
              <Textarea
                value={formData.note}
                onChange={(e) => handleInputChange("note", e.target.value)}
                className="resize-none"
              />
            </div>
          </div>

          {submitError && <div className="text-sm text-destructive">{submitError}</div>}

          <div className="flex justify-end gap-2">
            {booking.status !== "cancelled" && (
              <Button onClick={() => void handleCancelReservation()} variant="destructive">
                Отменить
              </Button>
            )}
            {booking.status === "pending" && (
              <Button onClick={() => void handleConfirmReservation()} variant="secondary">
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
            <Button variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={booking.status === "cancelled"}>
              Сохранить
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <PhoneIcon className="h-5 w-5 text-primary" />
              Подтверждение изменений
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Если вы точно уверены в изменении этих данных, позвоните по номеру
                  и предупредите о изменениях:
                </p>
                <div className="rounded-lg bg-muted p-4 text-center">
                  <a 
                    href="tel:+375291234567" 
                    className="text-lg font-semibold text-primary hover:underline"
                  >
                    +375 29 123-45-67
                  </a>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmSave()}>
              ОК, сохранить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
