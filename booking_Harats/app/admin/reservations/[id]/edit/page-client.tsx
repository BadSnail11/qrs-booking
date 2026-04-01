"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { ArrowLeft, CalendarIcon, Phone as PhoneIcon } from "lucide-react"
import type { Booking } from "@/app/admin/page"
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
import { ReservationStatusBadge } from "@/components/admin/reservation-status-badge"

const timeSlots = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30", "22:00",
]

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
  const [date, setDate] = useState<Date>()
  const [showConfirmation, setShowConfirmation] = useState(false)
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
    note: "",
  })

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
        const bookings = await adminApi.getReservations(targetDate)
        const matched = (bookings as Booking[]).find((item) => item.id === reservationId)
        if (!matched) {
          setPageError("Бронирование не найдено")
          return
        }
        setBooking(matched)
        setFormData({
          firstName: matched.firstName,
          lastName: matched.lastName,
          phone: matched.phone,
          email: matched.email || "",
          guests: String(matched.guests),
          sets: String(matched.sets),
          time: matched.time,
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

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
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
                  {booking.table_ids && booking.table_ids.length > 0 && (
                    <div className="mb-4 rounded-lg bg-muted p-3 text-sm">
                      Назначенные столы: {booking.table_ids.join(" + ")}
                    </div>
                  )}

                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Имя</Label>
                        <Input value={formData.firstName} onChange={(e) => handleInputChange("firstName", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Фамилия</Label>
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
                        <Select value={formData.guests} onValueChange={(v) => handleInputChange("guests", v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
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
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
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
                          <Calendar mode="single" selected={date} onSelect={setDate} locale={ru} />
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
                      <Textarea value={formData.note} onChange={(e) => handleInputChange("note", e.target.value)} className="resize-none" />
                    </div>
                  </div>

                  {submitError && <div className="mt-4 text-sm text-destructive">{submitError}</div>}

                  <div className="mt-6 flex flex-wrap justify-end gap-2">
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
                  <a href="tel:+375291234567" className="text-lg font-semibold text-primary hover:underline">
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
