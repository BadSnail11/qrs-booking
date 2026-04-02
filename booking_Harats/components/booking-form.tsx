"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarIcon, Check, Users, User, Phone, UtensilsCrossed, Timer, Mail, AlertTriangle, History } from "lucide-react"
import { userApi } from "@/lib/api"

const guestOptions = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]
const setOptions = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]
const USER_BOOKING_DRAFT_KEY = "qrs-user-booking-draft"
const USER_BOOKING_HISTORY_COOKIE = "qrs-user-booking-history"
const USER_BOOKING_HISTORY_LIMIT = 10

type ReservationDetails = {
  id: string
  date: string
  time: string
  status?: "confirmed" | "pending" | "cancelled"
}

type AvailabilitySchedule = {
  weekday: number
  dayName: string
  isOpen: boolean
  openTime: string | null
  closeTime: string | null
}

type AvailabilitySlot = {
  time: string
  available: boolean
  suggested_table_ids: number[]
  confirmation_mode?: "automatic" | "manual" | null
}

type UserBookingDraft = {
  date: string | null
  formData: {
    firstName: string
    lastName: string
    phone: string
    email: string
    guests: string
    set: string
    time: string
  }
}

type UserBookingHistoryItem = {
  id: string
  firstName: string
  lastName: string
  phone: string
  email: string
  date: string
  time: string
  status: "confirmed" | "pending" | "cancelled" | "unknown"
  createdAt: string
}

function readCookie(name: string) {
  if (typeof document === "undefined") return null
  const prefix = `${name}=`
  const entry = document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix))
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`
}

function loadReservationHistory() {
  const raw = readCookie(USER_BOOKING_HISTORY_COOKIE)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as UserBookingHistoryItem[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function saveReservationHistory(items: UserBookingHistoryItem[]) {
  writeCookie(
    USER_BOOKING_HISTORY_COOKIE,
    JSON.stringify(items.slice(0, USER_BOOKING_HISTORY_LIMIT)),
    60 * 60 * 24 * 180
  )
}

export function BookingForm() {
  const [date, setDate] = useState<Date>()
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showManualConfirmation, setShowManualConfirmation] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([])
  const [availabilitySchedule, setAvailabilitySchedule] = useState<AvailabilitySchedule | null>(null)
  const [reservationDetails, setReservationDetails] = useState<ReservationDetails | null>(null)
  const [reservationHistory, setReservationHistory] = useState<UserBookingHistoryItem[]>([])
  const [submitError, setSubmitError] = useState("")
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    guests: "",
    set: "",
    time: "",
  })

  const dateValue = useMemo(() => (date ? format(date, "yyyy-MM-dd") : ""), [date])
  const isReadyForTimeSelection = Boolean(
    formData.firstName.trim() &&
    formData.lastName.trim() &&
    formData.phone.trim() &&
    formData.guests &&
    date
  )
  const automaticSlots = useMemo(
    () => availableSlots.filter((slot) => slot.confirmation_mode === "automatic"),
    [availableSlots]
  )
  const manualSlots = useMemo(
    () => availableSlots.filter((slot) => slot.confirmation_mode === "manual"),
    [availableSlots]
  )
  const selectedSlot = useMemo(
    () => availableSlots.find((slot) => slot.time === formData.time) || null,
    [availableSlots, formData.time]
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      setReservationHistory(loadReservationHistory())
      const rawDraft = window.localStorage.getItem(USER_BOOKING_DRAFT_KEY)
      if (!rawDraft) return
      const draft = JSON.parse(rawDraft) as UserBookingDraft
      setFormData(draft.formData)
      if (draft.date) {
        const restoredDate = new Date(`${draft.date}T00:00:00`)
        setDate(restoredDate)
        if (draft.formData.guests) {
          void loadAvailability(restoredDate, draft.formData.guests)
        }
      }
    } catch {
      window.localStorage.removeItem(USER_BOOKING_DRAFT_KEY)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || isSubmitted) return
    const draft: UserBookingDraft = {
      date: date ? format(date, "yyyy-MM-dd") : null,
      formData,
    }
    window.localStorage.setItem(USER_BOOKING_DRAFT_KEY, JSON.stringify(draft))
  }, [date, formData, isSubmitted])

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const loadAvailability = async (nextDate: Date | undefined, guests: string) => {
    if (!nextDate || !guests) {
      setAvailableSlots([])
      setAvailabilitySchedule(null)
      return
    }
    try {
      const data = await userApi.getAvailability(format(nextDate, "yyyy-MM-dd"), parseInt(guests, 10))
      setAvailabilitySchedule(data.schedule)
      setAvailableSlots(data.slots.filter((slot) => slot.available))
    } catch {
      setAvailableSlots([])
      setAvailabilitySchedule(null)
    }
  }

  const submitReservation = async () => {
    setSubmitError("")
    setIsLoading(true)
    try {
      const result = await userApi.createReservation({
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        email: formData.email || undefined,
        guests: parseInt(formData.guests, 10),
        sets: parseInt(formData.set || "1", 10),
        date: dateValue,
        time: formData.time,
      })

      const reservation = result.reservation as ReservationDetails
      setReservationDetails(reservation)
      setIsSubmitted(true)
      setShowManualConfirmation(false)
      const nextHistoryItem: UserBookingHistoryItem = {
        id: reservation.id,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        date: reservation.date,
        time: reservation.time,
        status: reservation.status || "unknown",
        createdAt: new Date().toISOString(),
      }
      const nextHistory = [
        nextHistoryItem,
        ...reservationHistory.filter((item) => item.id !== reservation.id),
      ].slice(0, USER_BOOKING_HISTORY_LIMIT)
      setReservationHistory(nextHistory)
      saveReservationHistory(nextHistory)
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(USER_BOOKING_DRAFT_KEY)
      }
      setFormData({
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
        guests: "",
        set: "",
        time: "",
      })
      setDate(undefined)
      setAvailableSlots([])
      setAvailabilitySchedule(null)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось создать бронирование")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedSlot?.confirmation_mode === "manual") {
      setShowManualConfirmation(true)
      return
    }
    await submitReservation()
  }

  if (isSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-10 w-10 text-primary" />
        </div>
        <h2 className="mb-2 text-2xl font-semibold text-foreground">
          Бронь создана
        </h2>
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
          Сохраните детали бронирования. Отменить бронь можно только по звонку в заведение.
        </p>
        {reservationDetails && (
          <div className="mb-8 w-full max-w-sm rounded-2xl border border-border bg-background p-4 text-left text-sm">
            <div>Номер: #{reservationDetails.id}</div>
            <div>Дата: {reservationDetails.date}</div>
            <div>Время: {reservationDetails.time}</div>
          </div>
        )}
        <Button
          onClick={() => setIsSubmitted(false)}
          variant="outline"
          className="h-12 rounded-xl px-8"
        >
          Новое бронирование
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-3xl border border-border bg-card p-6">
        <div className="mb-6 rounded-2xl border border-border bg-background/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <div>
                <div className="text-sm font-medium text-foreground">Мои бронирования</div>
                <div className="text-xs text-muted-foreground">
                  История сохраняется в cookies этого браузера
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setShowHistory((prev) => !prev)}
            >
              {showHistory ? "Скрыть" : "Показать"}
            </Button>
          </div>

          {showHistory && (
            <div className="mt-4 space-y-3">
              {reservationHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  В этом браузере пока нет сохранённых бронирований.
                </div>
              ) : (
                reservationHistory.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border bg-card p-4 text-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-medium text-foreground">
                          {item.firstName} {item.lastName}
                        </div>
                        <div className="text-muted-foreground">
                          {item.date} • {item.time}
                        </div>
                        <div className="text-muted-foreground">{item.phone}</div>
                        {item.email && <div className="text-muted-foreground">{item.email}</div>}
                      </div>
                      <div className="text-left sm:text-right">
                        <div className="font-medium text-foreground">#{item.id}</div>
                        <div className="text-muted-foreground">
                          {item.status === "confirmed"
                            ? "Подтверждена"
                            : item.status === "pending"
                              ? "Ожидает подтверждения"
                              : item.status === "cancelled"
                                ? "Отменена"
                                : "Статус неизвестен"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span>Личные данные</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName" className="text-xs text-muted-foreground">
                Имя
              </Label>
              <Input id="firstName" placeholder="Иван" value={formData.firstName} onChange={(e) => handleInputChange("firstName", e.target.value)} required className="h-12 rounded-xl border-border bg-background text-base placeholder:text-muted-foreground/50" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName" className="text-xs text-muted-foreground">
                Фамилия
              </Label>
              <Input id="lastName" placeholder="Иванов" value={formData.lastName} onChange={(e) => handleInputChange("lastName", e.target.value)} required className="h-12 rounded-xl border-border bg-background text-base placeholder:text-muted-foreground/50" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs text-muted-foreground">
              Телефон
            </Label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input id="phone" type="tel" placeholder="+375 (999) 123-45-67" value={formData.phone} onChange={(e) => handleInputChange("phone", e.target.value)} required className="h-12 rounded-xl border-border bg-background pl-11 text-base placeholder:text-muted-foreground/50" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="email" className="text-xs text-muted-foreground">
                Email
              </Label>
              <span className="text-[10px] text-muted-foreground/50">Необязательно</span>
            </div>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input id="email" type="email" placeholder="ivan@example.com" value={formData.email} onChange={(e) => handleInputChange("email", e.target.value)} className="h-12 rounded-xl border-border bg-background pl-11 text-base placeholder:text-muted-foreground/50" />
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>Детали бронирования</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Гости
              </Label>
              <Select
                value={formData.guests}
                onValueChange={(value) => {
                  setFormData((prev) => ({ ...prev, guests: value, time: "" }))
                  void loadAvailability(date, value)
                }}
              >
                <SelectTrigger className="h-12 rounded-xl border-border bg-background text-base">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground/50" />
                    <SelectValue placeholder="Кол-во" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {guestOptions.map((num) => (
                    <SelectItem key={num} value={num} className="text-base">
                      {num}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Сеты
              </Label>
              <Select value={formData.set} onValueChange={(value) => handleInputChange("set", value)}>
                <SelectTrigger className="h-12 rounded-xl border-border bg-background text-base">
                  <div className="flex items-center gap-2">
                    <UtensilsCrossed className="h-4 w-4 text-muted-foreground/50" />
                    <SelectValue placeholder="Кол-во" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {setOptions.map((num) => (
                    <SelectItem key={num} value={num} className="text-base">
                      {num}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Дата
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-12 w-full justify-start rounded-xl border-border bg-background text-base font-normal",
                    !date && "text-muted-foreground/50"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground/50" />
                  {date ? format(date, "d MMMM, EEEE", { locale: ru }) : "Выберите дату"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(value) => {
                    setDate(value)
                    setFormData((prev) => ({ ...prev, time: "" }))
                    void loadAvailability(value, formData.guests)
                  }}
                  locale={ru}
                  disabled={(day) => day < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Время начала
              </Label>
              <span className="flex items-center gap-1 text-[10px] text-primary">
                <Timer className="h-3 w-3" />
                2 часа
              </span>
            </div>
            {!isReadyForTimeSelection ? (
              <div className="rounded-xl border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                Заполните имя, фамилию, телефон, количество гостей и дату, чтобы увидеть доступное время.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-medium text-emerald-700">
                    Подтверждаются автоматически
                  </div>
                  {automaticSlots.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {automaticSlots.map((slot) => (
                        <button
                          key={slot.time}
                          type="button"
                          onClick={() => handleInputChange("time", slot.time)}
                          className={cn(
                            "rounded-xl border px-4 py-2 text-sm transition-colors",
                            formData.time === slot.time
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          )}
                        >
                          {slot.time}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Нет автоматических слотов</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-amber-700">
                    Требуют подтверждения
                  </div>
                  {manualSlots.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {manualSlots.map((slot) => (
                        <button
                          key={slot.time}
                          type="button"
                          onClick={() => handleInputChange("time", slot.time)}
                          className={cn(
                            "rounded-xl border px-4 py-2 text-sm transition-colors",
                            formData.time === slot.time
                              ? "border-amber-500 bg-amber-500 text-white"
                              : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                          )}
                        >
                          {slot.time}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Нет слотов с ручным подтверждением</p>
                  )}
                </div>
              </div>
            )}
            {isReadyForTimeSelection && availableSlots.length === 0 && (
              <p className="text-xs text-destructive">
                {availabilitySchedule && !availabilitySchedule.isOpen
                  ? "На выбранный день бронирование закрыто"
                  : "Нет доступных слотов на выбранную дату"}
              </p>
            )}
            {availabilitySchedule?.isOpen && availabilitySchedule.openTime && availabilitySchedule.closeTime && (
              <p className="text-xs text-muted-foreground">
                График бронирования на день: {availabilitySchedule.openTime} - {availabilitySchedule.closeTime}
              </p>
            )}
          </div>
        </div>
        {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <Button
            type="submit"
            disabled={isLoading}
            className="h-14 w-full rounded-2xl bg-primary text-base font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] disabled:opacity-70"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Бронируем...
              </span>
            ) : (
              "Забронировать"
            )}
          </Button>
        </form>
      </div>

      <AlertDialog open={showManualConfirmation} onOpenChange={setShowManualConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Подтверждение бронирования
            </AlertDialogTitle>
            <AlertDialogDescription>
              Вы выбрали время, которое требует ручного подтверждения. Нет гарантии, что бронирование будет принято.
              Вы уверены, что хотите отправить заявку на это время?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Назад</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submitReservation()}>
              Да, отправить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
