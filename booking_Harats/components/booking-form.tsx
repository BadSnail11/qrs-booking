"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarIcon, Check, Users, User, Phone, UtensilsCrossed, Timer, AlertTriangle, History, ShieldCheck } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { userApi } from "@/lib/api"
import {
  MAX_PARTY_SIZE,
  MAX_SETS,
  SETS_FORM_NONE,
  formatSetsLabel,
  isDateInSetsChoiceRange,
  partySizeOptions,
  setsFormValueToApi,
  setCountOptions,
  type SetsChoiceInterval,
} from "@/lib/booking-limits"
const USER_BOOKING_DRAFT_KEY = "qrs-user-booking-draft"
const OFFER_PDF_URL = "/oferta_mise_v3.pdf"
const OFFER_DOCUMENT_ID = "oferta_mise_v3.pdf"
const USER_BOOKING_HISTORY_COOKIE = "qrs-user-booking-history"
const USER_BOOKING_HISTORY_LIMIT = 10

type ReservationDetails = {
  id: string
  date: string
  time: string
  status?: "confirmed" | "pending" | "cancelled"
  guests?: number
  sets?: number
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
  restaurantSlug?: string | null
  date: string | null
  formData: {
    firstName: string
    lastName: string
    phone: string
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
  date: string
  time: string
  /** Present for entries saved after this update */
  guests?: number
  sets?: number
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

type FieldKey =
  | "firstName"
  | "lastName"
  | "phone"
  | "smsCode"
  | "guests"
  | "set"
  | "date"
  | "time"
  | "offerAccepted"

type SlugStatus = "loading" | "ok" | "invalid" | "error"

export type BookingFormProps = {
  restaurantSlug: string
  setsChoiceIntervals: SetsChoiceInterval[]
}

function getPhoneError(phone: string): string | null {
  const trimmed = phone.trim()
  if (!trimmed) return "Укажите номер телефона."
  const digits = trimmed.replace(/\D/g, "")
  if (digits.length < 10) return "Телефон слишком короткий. Нужно не менее 10 цифр."
  if (digits.length > 15) return "Слишком много цифр в номере."
  return null
}

function phoneDigitsKey(phone: string) {
  return phone.replace(/\D/g, "")
}

type PhoneConfirmedStatus = {
  alreadyConfirmed?: boolean
  verificationToken?: string
  reason?: "visitor" | "session"
  firstName?: string
  lastName?: string
  namesLocked?: boolean
}

export function BookingForm({ restaurantSlug, setsChoiceIntervals }: BookingFormProps) {
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("loading")
  const [restaurantDisplayName, setRestaurantDisplayName] = useState("")
  const [slugCheckRetryKey, setSlugCheckRetryKey] = useState(0)
  const draftAppliedForSlug = useRef<string | null>(null)
  const confirmedPhoneKeyRef = useRef<string | null>(null)
  const [date, setDate] = useState<Date>()
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false)
  const [showManualConfirmation, setShowManualConfirmation] = useState(false)
  const [showReviewDialog, setShowReviewDialog] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([])
  const [availabilitySchedule, setAvailabilitySchedule] = useState<AvailabilitySchedule | null>(null)
  const [reservationDetails, setReservationDetails] = useState<ReservationDetails | null>(null)
  const [reservationHistory, setReservationHistory] = useState<UserBookingHistoryItem[]>([])
  const [submitError, setSubmitError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    guests: "",
    set: "",
    time: "",
  })
  const [smsCode, setSmsCode] = useState("")
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [phoneVerificationToken, setPhoneVerificationToken] = useState<string | null>(null)
  const [isSendingSms, setIsSendingSms] = useState(false)
  const [isVerifyingSms, setIsVerifyingSms] = useState(false)
  const [phoneVerifyMessage, setPhoneVerifyMessage] = useState("")
  const [phoneVerifyError, setPhoneVerifyError] = useState("")
  const [smsCodeSent, setSmsCodeSent] = useState(false)
  const [phoneConfirmReason, setPhoneConfirmReason] = useState<"visitor" | "session" | "code" | null>(null)
  const [isCheckingPhone, setIsCheckingPhone] = useState(false)
  const [nameInputsLocked, setNameInputsLocked] = useState(false)
  const [acceptedOffer, setAcceptedOffer] = useState(false)
  const [marketingConsent, setMarketingConsent] = useState(false)

  const dateValue = useMemo(() => (date ? format(date, "yyyy-MM-dd") : ""), [date])
  const isSetsChoiceAllowed = useMemo(
    () => Boolean(date && isDateInSetsChoiceRange(date, setsChoiceIntervals)),
    [date, setsChoiceIntervals]
  )
  const setsSelectionOk = useMemo(() => {
    if (!date) return true
    if (!isDateInSetsChoiceRange(date, setsChoiceIntervals)) {
      return formData.set === SETS_FORM_NONE
    }
    if (!formData.set) return false
    if (formData.set === SETS_FORM_NONE) return true
    const s = parseInt(formData.set, 10)
    return Number.isFinite(s) && s >= 1 && s <= MAX_SETS
  }, [date, formData.set, setsChoiceIntervals])
  const isReadyForTimeSelection = useMemo(
    () =>
      Boolean(
        restaurantSlug &&
          formData.firstName.trim() &&
          formData.lastName.trim() &&
          !getPhoneError(formData.phone) &&
          phoneVerified &&
          formData.guests &&
          setsSelectionOk &&
          date
      ),
    [
      restaurantSlug,
      formData.firstName,
      formData.lastName,
      formData.phone,
      phoneVerified,
      formData.guests,
      setsSelectionOk,
      date,
    ]
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

  const reviewDateFormatted = useMemo(
    () => (date ? format(date, "d MMMM yyyy", { locale: ru }) : ""),
    [date]
  )

  useEffect(() => {
    draftAppliedForSlug.current = null
  }, [restaurantSlug, setsChoiceIntervals])

  useEffect(() => {
    setSlugStatus("loading")
    setRestaurantDisplayName("")
    let cancelled = false
    void userApi
      .listRestaurants()
      .then((rows) => {
        if (cancelled) return
        const row = rows.find((r) => r.slug === restaurantSlug)
        if (!row) {
          setSlugStatus("invalid")
          return
        }
        setRestaurantDisplayName(row.displayName)
        setSlugStatus("ok")
      })
      .catch(() => {
        if (cancelled) return
        setSlugStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [restaurantSlug, slugCheckRetryKey])

  useEffect(() => {
    if (typeof window === "undefined") return
    setReservationHistory(loadReservationHistory())
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || slugStatus !== "ok") return
    if (draftAppliedForSlug.current === restaurantSlug) return
    draftAppliedForSlug.current = restaurantSlug
    try {
      const rawDraft = window.localStorage.getItem(USER_BOOKING_DRAFT_KEY)
      if (!rawDraft) return
      const draft = JSON.parse(rawDraft) as UserBookingDraft
      if (draft.restaurantSlug && draft.restaurantSlug !== restaurantSlug) {
        return
      }
      const g = parseInt(draft.formData.guests, 10)
      const guestsRestored =
        Number.isFinite(g) && g >= 1 && g <= MAX_PARTY_SIZE ? String(g) : ""
      const restoredDate = draft.date ? new Date(`${draft.date}T00:00:00`) : undefined
      const draftInSetsRange = restoredDate
        ? isDateInSetsChoiceRange(restoredDate, setsChoiceIntervals)
        : false
      let setRestored = ""
      if (draft.formData.set === SETS_FORM_NONE) {
        setRestored = SETS_FORM_NONE
      } else if (draftInSetsRange) {
        const s = parseInt(draft.formData.set, 10)
        if (Number.isFinite(s) && s >= 1 && s <= MAX_SETS) setRestored = String(s)
      } else if (restoredDate) {
        setRestored = SETS_FORM_NONE
      }
      setFormData({ ...draft.formData, guests: guestsRestored, set: setRestored })
      if (draft.date && restoredDate) {
        setDate(restoredDate)
        if (guestsRestored) {
          void loadAvailability(restoredDate, guestsRestored, restaurantSlug)
        }
      }
    } catch {
      window.localStorage.removeItem(USER_BOOKING_DRAFT_KEY)
    }
  }, [slugStatus, restaurantSlug, setsChoiceIntervals])

  useEffect(() => {
    if (typeof window === "undefined" || isSubmitted) return
    const draft: UserBookingDraft = {
      restaurantSlug: restaurantSlug || null,
      date: date ? format(date, "yyyy-MM-dd") : null,
      formData,
    }
    window.localStorage.setItem(USER_BOOKING_DRAFT_KEY, JSON.stringify(draft))
  }, [date, formData, isSubmitted, restaurantSlug])

  useEffect(() => {
    if (!date) return
    if (!isDateInSetsChoiceRange(date, setsChoiceIntervals)) {
      setFormData((prev) => (prev.set !== SETS_FORM_NONE ? { ...prev, set: SETS_FORM_NONE } : prev))
      setFieldErrors((prev) => {
        if (!prev.set) return prev
        const next = { ...prev }
        delete next.set
        return next
      })
    }
  }, [date, setsChoiceIntervals])

  useEffect(() => {
    if (date && formData.guests && restaurantSlug) {
      void loadAvailability(date, formData.guests, restaurantSlug)
    }
  }, [restaurantSlug])

  const resetPhoneVerification = () => {
    setPhoneVerified(false)
    setPhoneVerificationToken(null)
    setSmsCode("")
    setSmsCodeSent(false)
    setPhoneVerifyMessage("")
    setPhoneVerifyError("")
    setPhoneConfirmReason(null)
    setNameInputsLocked(false)
    confirmedPhoneKeyRef.current = null
  }

  const applyPhoneConfirmed = (status: PhoneConfirmedStatus, phoneValue: string) => {
    if (!status.alreadyConfirmed) return false
    setPhoneVerified(true)
    setPhoneVerificationToken(status.verificationToken ?? null)
    confirmedPhoneKeyRef.current = phoneDigitsKey(phoneValue)
    setPhoneConfirmReason(
      status.reason === "visitor" ? "visitor" : status.reason === "session" ? "session" : "code"
    )
    const lockNames = Boolean(status.namesLocked)
    setNameInputsLocked(lockNames)
    if (status.firstName || status.lastName || lockNames) {
      setFormData((prev) => ({
        ...prev,
        firstName: status.firstName ?? prev.firstName,
        lastName: status.lastName ?? prev.lastName,
      }))
    }
    setSmsCodeSent(false)
    setPhoneVerifyError("")
    setPhoneVerifyMessage(
      status.reason === "visitor"
        ? "Номер уже подтверждён — код не нужен"
        : "Телефон подтверждён"
    )
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next.phone
      delete next.smsCode
      return next
    })
    return true
  }

  const checkPhoneStatus = async (phone: string) => {
    const pe = getPhoneError(phone)
    if (pe) return
    setIsCheckingPhone(true)
    try {
      const status = await userApi.getPhoneStatus({
        restaurant: restaurantSlug,
        phone: phone.trim(),
      })
      applyPhoneConfirmed(status, phone)
    } catch {
      /* ignore — user can still request SMS manually */
    } finally {
      setIsCheckingPhone(false)
    }
  }

  const clearFieldError = (field: FieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    if (field === "firstName" || field === "lastName" || field === "phone") {
      clearFieldError(field)
    }
    if (field === "phone") {
      const prevKey = phoneDigitsKey(formData.phone)
      const nextKey = phoneDigitsKey(value)
      if (nextKey !== prevKey && confirmedPhoneKeyRef.current !== nextKey) {
        resetPhoneVerification()
        setFormData((prev) => ({ ...prev, firstName: "", lastName: "" }))
      }
    }
    if (field === "set") clearFieldError("set")
    if (field === "time") clearFieldError("time")
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const validateBookingForm = (): Partial<Record<FieldKey, string>> => {
    const e: Partial<Record<FieldKey, string>> = {}
    const pe = getPhoneError(formData.phone)
    if (pe) e.phone = pe
    else if (!phoneVerified) e.phone = "Подтвердите телефон кодом из SMS."
    if (phoneVerified && !nameInputsLocked) {
      if (!formData.firstName.trim()) e.firstName = "Введите имя."
      if (!formData.lastName.trim()) e.lastName = "Введите фамилию."
    }
    if (smsCodeSent && !phoneVerified && phoneConfirmReason !== "visitor" && smsCode.trim().length !== 6) {
      e.smsCode = "Введите 6-значный код."
    }
    if (!formData.guests) {
      e.guests = "Выберите количество гостей."
    } else {
      const g = parseInt(formData.guests, 10)
      if (!Number.isFinite(g) || g < 1 || g > MAX_PARTY_SIZE) {
        e.guests = `Максимум ${MAX_PARTY_SIZE} гостей.`
      }
    }
    if (date) {
      if (!isDateInSetsChoiceRange(date, setsChoiceIntervals)) {
        if (formData.set !== SETS_FORM_NONE) {
          e.set = "Выберите вариант сетов."
        }
      } else {
        if (!formData.set) {
          e.set = "Выберите количество сетов или «Без сетов»."
        } else if (formData.set !== SETS_FORM_NONE) {
          const s = parseInt(formData.set, 10)
          if (!Number.isFinite(s) || s < 1 || s > MAX_SETS) {
            e.set = `Максимум ${MAX_SETS} сетов.`
          }
        }
      }
    }
    if (!date) e.date = "Выберите дату."
    if (!formData.time) e.time = "Выберите время бронирования."
    if (!acceptedOffer) {
      e.offerAccepted =
        "Примите условия публичной оферты и дайте согласие на обработку персональных данных."
    }
    return e
  }

  /** Show red border + message under field on blur when value is invalid. */
  const handleFieldBlur = (field: "firstName" | "lastName" | "phone") => {
    setFieldErrors((prev) => {
      const next = { ...prev }
      if (field === "firstName") {
        if (!phoneVerified || nameInputsLocked) delete next.firstName
        else if (!formData.firstName.trim()) next.firstName = "Введите имя."
        else delete next.firstName
      } else if (field === "lastName") {
        if (!phoneVerified || nameInputsLocked) delete next.lastName
        else if (!formData.lastName.trim()) next.lastName = "Введите фамилию."
        else delete next.lastName
      } else if (field === "phone") {
        const err = getPhoneError(formData.phone)
        if (err) next.phone = err
        else if (!phoneVerified) next.phone = "Подтвердите телефон кодом из SMS."
        else delete next.phone
      }
      return next
    })
    if (field === "phone" && !getPhoneError(formData.phone)) {
      void checkPhoneStatus(formData.phone)
    }
  }

  const sendSmsCode = async () => {
    setPhoneVerifyError("")
    setPhoneVerifyMessage("")
    const pe = getPhoneError(formData.phone)
    if (pe) {
      setFieldErrors((prev) => ({ ...prev, phone: pe }))
      return
    }
    setIsSendingSms(true)
    try {
      const result = await userApi.sendPhoneVerificationCode({
        restaurant: restaurantSlug,
        phone: formData.phone.trim(),
      })
      if (result.alreadyConfirmed) {
        applyPhoneConfirmed(result, formData.phone.trim())
        return
      }
      setSmsCodeSent(true)
      setPhoneVerified(false)
      setPhoneVerificationToken(null)
      setPhoneConfirmReason(null)
      setPhoneVerifyMessage(
        result.devCode
          ? `Код для разработки: ${result.devCode}`
          : "Код отправлен по SMS. Введите его ниже."
      )
    } catch (error) {
      setPhoneVerifyError(error instanceof Error ? error.message : "Не удалось отправить код")
    } finally {
      setIsSendingSms(false)
    }
  }

  const verifySmsCode = async () => {
    setPhoneVerifyError("")
    const code = smsCode.trim()
    if (code.length !== 6) {
      setFieldErrors((prev) => ({ ...prev, smsCode: "Введите 6-значный код." }))
      return
    }
    setIsVerifyingSms(true)
    try {
      const result = await userApi.verifyPhoneCode({
        restaurant: restaurantSlug,
        phone: formData.phone.trim(),
        code,
      })
      setPhoneVerified(true)
      setPhoneVerificationToken(result.verificationToken)
      setNameInputsLocked(false)
      confirmedPhoneKeyRef.current = phoneDigitsKey(formData.phone)
      setPhoneConfirmReason("code")
      setPhoneVerifyMessage("Телефон подтверждён")
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next.phone
        delete next.smsCode
        return next
      })
    } catch (error) {
      setPhoneVerifyError(error instanceof Error ? error.message : "Неверный код")
    } finally {
      setIsVerifyingSms(false)
    }
  }

  const loadAvailability = async (nextDate: Date | undefined, guests: string, slug: string) => {
    if (!nextDate || !guests || !slug) {
      setAvailableSlots([])
      setAvailabilitySchedule(null)
      setIsAvailabilityLoading(false)
      return
    }
    setIsAvailabilityLoading(true)
    try {
      const data = await userApi.getAvailability(format(nextDate, "yyyy-MM-dd"), parseInt(guests, 10), slug)
      setAvailabilitySchedule(data.schedule)
      setAvailableSlots(data.slots.filter((slot) => slot.available))
    } catch {
      setAvailableSlots([])
      setAvailabilitySchedule(null)
    } finally {
      setIsAvailabilityLoading(false)
    }
  }

  const submitReservation = async () => {
    setSubmitError("")
    const errors = validateBookingForm()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setShowManualConfirmation(false)
      return
    }

    if (!phoneVerified) {
      setSubmitError("Подтвердите телефон кодом из SMS.")
      return
    }

    setIsLoading(true)
    try {
      const setsPayload = setsFormValueToApi(formData.set, date, setsChoiceIntervals)
      const reservationBody: Record<string, unknown> = {
        restaurant: restaurantSlug,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim(),
        guests: parseInt(formData.guests, 10),
        sets: setsPayload,
        date: dateValue,
        time: formData.time,
      }
      if (phoneVerificationToken) {
        reservationBody.phoneVerificationToken = phoneVerificationToken
      }
      reservationBody.offerAccepted = true
      reservationBody.marketingConsent = marketingConsent
      reservationBody.offerDocument = OFFER_DOCUMENT_ID
      const result = await userApi.createReservation(reservationBody)

      const reservation = result.reservation as ReservationDetails & {
        guests?: number
        sets?: number
      }
      setReservationDetails({
        ...reservation,
        guests: reservation.guests ?? parseInt(formData.guests, 10),
        sets: reservation.sets ?? setsPayload,
      })
      setIsSubmitted(true)
      setShowManualConfirmation(false)
      const nextHistoryItem: UserBookingHistoryItem = {
        id: reservation.id,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim(),
        date: reservation.date,
        time: reservation.time,
        guests: parseInt(formData.guests, 10),
        sets: setsPayload,
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
        guests: "",
        set: "",
        time: "",
      })
      setDate(undefined)
      setAvailableSlots([])
      setAvailabilitySchedule(null)
      resetPhoneVerification()
      setAcceptedOffer(false)
      setMarketingConsent(false)
    } catch (error) {
      if (error instanceof TypeError) {
        setSubmitError("Нет соединения с сервером. Проверьте интернет и попробуйте снова.")
      } else {
        setSubmitError(error instanceof Error ? error.message : "Не удалось создать бронирование. Попробуйте позже.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errors = validateBookingForm()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }
    setShowReviewDialog(true)
  }

  const handleReviewConfirm = () => {
    setShowReviewDialog(false)
    if (selectedSlot?.confirmation_mode === "manual") {
      setShowManualConfirmation(true)
    } else {
      void submitReservation()
    }
  }

  const handleReviewChange = () => {
    setShowReviewDialog(false)
  }

  if (slugStatus === "loading") {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">Загрузка…</div>
    )
  }

  if (slugStatus === "invalid") {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="max-w-sm text-sm text-destructive">Ресторан не найден или недоступен для бронирования.</p>
        <Button asChild variant="outline" className="h-12 rounded-xl px-6">
          <Link href="/">Выбрать другой ресторан</Link>
        </Button>
      </div>
    )
  }

  if (slugStatus === "error") {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="max-w-sm text-sm text-destructive">
          Не удалось загрузить данные. Проверьте соединение и попробуйте снова.
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-12 rounded-xl px-6"
          onClick={() => setSlugCheckRetryKey((k) => k + 1)}
        >
          Повторить
        </Button>
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-2">
          К списку ресторанов
        </Link>
      </div>
    )
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
          <div className="mb-8 w-full max-w-sm rounded-2xl border border-border bg-background p-4 text-left text-sm space-y-1">
            <div>Номер: #{reservationDetails.id}</div>
            <div>Дата: {reservationDetails.date}</div>
            <div>Время: {reservationDetails.time}</div>
            {reservationDetails.guests != null && (
              <div>Гостей: {reservationDetails.guests}</div>
            )}
            {reservationDetails.sets != null && (
              <div>Сеты: {formatSetsLabel(reservationDetails.sets)}</div>
            )}
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
                        {(item.guests != null || item.sets != null) && (
                          <div className="text-muted-foreground">
                            {item.guests != null && <span>Гостей: {item.guests}</span>}
                            {item.guests != null && item.sets != null && " · "}
                            {item.sets != null && <span>Сеты: {formatSetsLabel(item.sets)}</span>}
                          </div>
                        )}
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

        <form noValidate onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span>Личные данные</span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs text-muted-foreground">
              Телефон <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                placeholder="+375 (999) 123-45-67"
                value={formData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                onBlur={() => handleFieldBlur("phone")}
                autoComplete="tel"
                aria-invalid={Boolean(fieldErrors.phone)}
                className={cn(
                  "h-12 rounded-xl border bg-background pl-11 text-base placeholder:text-muted-foreground/50",
                  fieldErrors.phone ? "border-destructive ring-1 ring-destructive/40" : "border-border"
                )}
              />
            </div>
            {fieldErrors.phone && <p className="text-xs text-destructive">{fieldErrors.phone}</p>}
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Подтверждение телефона</span>
            </div>
            {isCheckingPhone && (
              <p className="text-xs text-muted-foreground">Проверяем номер…</p>
            )}
            {phoneVerified ? (
              <p className="flex items-center gap-2 text-sm text-primary">
                <Check className="h-4 w-4" />
                {phoneConfirmReason === "visitor"
                  ? "Номер уже подтверждён — SMS не требуется"
                  : "Телефон подтверждён"}
              </p>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-xl"
                  disabled={
                    isSendingSms || isCheckingPhone || Boolean(getPhoneError(formData.phone))
                  }
                  onClick={() => void sendSmsCode()}
                >
                  {isSendingSms ? "Отправляем код…" : smsCodeSent ? "Отправить код снова" : "Отправить код по SMS"}
                </Button>
                {smsCodeSent && (
                  <div className="space-y-1.5">
                    <Label htmlFor="smsCode" className="text-xs text-muted-foreground">
                      Код из SMS <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="smsCode"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        maxLength={6}
                        value={smsCode}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(0, 6)
                          setSmsCode(v)
                          clearFieldError("smsCode")
                        }}
                        aria-invalid={Boolean(fieldErrors.smsCode)}
                        className={cn(
                          "h-12 flex-1 rounded-xl border bg-background text-base tracking-widest",
                          fieldErrors.smsCode ? "border-destructive ring-1 ring-destructive/40" : "border-border"
                        )}
                      />
                      <Button
                        type="button"
                        className="h-12 rounded-xl px-4"
                        disabled={isVerifyingSms || smsCode.length !== 6}
                        onClick={() => void verifySmsCode()}
                      >
                        {isVerifyingSms ? "…" : "OK"}
                      </Button>
                    </div>
                    {fieldErrors.smsCode && <p className="text-xs text-destructive">{fieldErrors.smsCode}</p>}
                  </div>
                )}
              </>
            )}
            {phoneVerifyMessage && !phoneVerifyError && (
              <p className="text-xs text-muted-foreground">{phoneVerifyMessage}</p>
            )}
            {phoneVerifyError && <p className="text-xs text-destructive">{phoneVerifyError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName" className="text-xs text-muted-foreground">
                Имя <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                placeholder="Иван"
                value={formData.firstName}
                onChange={(e) => handleInputChange("firstName", e.target.value)}
                onBlur={() => handleFieldBlur("firstName")}
                autoComplete="given-name"
                disabled={!phoneVerified || nameInputsLocked}
                aria-invalid={Boolean(fieldErrors.firstName)}
                className={cn(
                  "h-12 rounded-xl border bg-background text-base placeholder:text-muted-foreground/50",
                  fieldErrors.firstName ? "border-destructive ring-1 ring-destructive/40" : "border-border"
                )}
              />
              {fieldErrors.firstName && <p className="text-xs text-destructive">{fieldErrors.firstName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName" className="text-xs text-muted-foreground">
                Фамилия <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastName"
                placeholder="Иванов"
                value={formData.lastName}
                onChange={(e) => handleInputChange("lastName", e.target.value)}
                onBlur={() => handleFieldBlur("lastName")}
                autoComplete="family-name"
                disabled={!phoneVerified || nameInputsLocked}
                aria-invalid={Boolean(fieldErrors.lastName)}
                className={cn(
                  "h-12 rounded-xl border bg-background text-base placeholder:text-muted-foreground/50",
                  fieldErrors.lastName ? "border-destructive ring-1 ring-destructive/40" : "border-border"
                )}
              />
              {fieldErrors.lastName && <p className="text-xs text-destructive">{fieldErrors.lastName}</p>}
            </div>
          </div>
          {!phoneVerified && (
            <p className="text-xs text-muted-foreground">
              Сначала подтвердите номер телефона, затем укажите имя и фамилию.
            </p>
          )}
        </div>

        <div className="h-px bg-border" />

          <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>Детали бронирования</span>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ресторан</Label>
            <div className="flex min-h-12 items-center rounded-xl border border-border bg-muted/30 px-4 py-3 text-base font-medium text-foreground">
              {restaurantDisplayName || restaurantSlug}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Гости <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.guests}
              onValueChange={(value) => {
                clearFieldError("guests")
                setFormData((prev) => ({ ...prev, guests: value, time: "" }))
                void loadAvailability(date, value, restaurantSlug)
              }}
            >
              <SelectTrigger
                className={cn(
                  "h-12 rounded-xl border bg-background text-base",
                  fieldErrors.guests ? "border-destructive ring-1 ring-destructive/40" : "border-border"
                )}
                aria-invalid={Boolean(fieldErrors.guests)}
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground/50" />
                  <SelectValue placeholder="Кол-во" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {partySizeOptions.map((num) => (
                  <SelectItem key={num} value={num} className="text-base">
                    {num}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.guests && <p className="text-xs text-destructive">{fieldErrors.guests}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Дата <span className="text-destructive">*</span>
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-12 w-full justify-start rounded-xl border bg-background text-base font-normal",
                    !date && "text-muted-foreground/50",
                    fieldErrors.date ? "border-destructive ring-1 ring-destructive/40" : "border-border"
                  )}
                  aria-invalid={Boolean(fieldErrors.date)}
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
                    clearFieldError("date")
                    setDate(value)
                    const wasInSetsRange = date
                      ? isDateInSetsChoiceRange(date, setsChoiceIntervals)
                      : false
                    const nowInSetsRange = value
                      ? isDateInSetsChoiceRange(value, setsChoiceIntervals)
                      : false
                    setFormData((prev) => {
                      let nextSet = prev.set
                      if (!value) {
                        nextSet = ""
                      } else if (!nowInSetsRange) {
                        nextSet = SETS_FORM_NONE
                      } else if (!wasInSetsRange && prev.set === SETS_FORM_NONE) {
                        // Entering the menu period from outside (forced «Без сетов»): ask for an explicit choice.
                        nextSet = ""
                      } else {
                        nextSet = prev.set
                      }
                      return { ...prev, time: "", set: nextSet }
                    })
                    void loadAvailability(value, formData.guests, restaurantSlug)
                  }}
                  locale={ru}
                  disabled={(day) => day < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {fieldErrors.date && <p className="text-xs text-destructive">{fieldErrors.date}</p>}
          </div>

          {date && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Сеты <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.set}
                onValueChange={(value) => {
                  clearFieldError("set")
                  handleInputChange("set", value)
                }}
                disabled={!isSetsChoiceAllowed}
              >
                <SelectTrigger
                  className={cn(
                    "h-12 rounded-xl border bg-background text-base",
                    fieldErrors.set ? "border-destructive ring-1 ring-destructive/40" : "border-border"
                  )}
                  aria-invalid={Boolean(fieldErrors.set)}
                >
                  <div className="flex items-center gap-2">
                    <UtensilsCrossed className="h-4 w-4 text-muted-foreground/50" />
                    <SelectValue placeholder="Выберите" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {isSetsChoiceAllowed ? (
                    <>
                      <SelectItem value={SETS_FORM_NONE} className="text-base">
                        Без сетов
                      </SelectItem>
                      {setCountOptions.map((num) => (
                        <SelectItem key={num} value={num} className="text-base">
                          {num}
                        </SelectItem>
                      ))}
                    </>
                  ) : (
                    <SelectItem value={SETS_FORM_NONE} className="text-base">
                      Без сетов
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {fieldErrors.set && <p className="text-xs text-destructive">{fieldErrors.set}</p>}
              {date && !isSetsChoiceAllowed && (
                <p className="text-xs text-muted-foreground">
                  {setsChoiceIntervals.length === 0
                    ? "Выбор количества сетов для этого ресторана не настроен."
                    : "Для выбранной даты выбор сетов недоступен — только в датах из периодов, заданных в админке."}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Время начала <span className="text-destructive">*</span>
              </Label>
              <span className="flex items-center gap-1 text-[10px] text-primary">
                <Timer className="h-3 w-3" />
                2 часа
              </span>
            </div>
            {!isReadyForTimeSelection ? (
              <div
                className={cn(
                  "rounded-xl border border-dashed bg-background px-4 py-3 text-sm text-muted-foreground",
                  fieldErrors.time ? "border-destructive ring-1 ring-destructive/40" : "border-border"
                )}
              >
                Заполните все поля выше (имя, фамилия, подтверждённый телефон, гости, дату и сеты), чтобы увидеть доступное время.
              </div>
            ) : isAvailabilityLoading ? (
              <div
                className={cn(
                  "rounded-xl border bg-background px-4 py-6 text-sm text-muted-foreground",
                  fieldErrors.time ? "border-destructive ring-1 ring-destructive/40" : "border-border"
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Загружаем доступное время...
                </span>
              </div>
            ) : (
              <div
                className={cn(
                  "space-y-4 rounded-xl border p-3",
                  fieldErrors.time ? "border-destructive ring-1 ring-destructive/40" : "border-transparent"
                )}
              >
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
            {isReadyForTimeSelection && !isAvailabilityLoading && availableSlots.length === 0 && (
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
            {fieldErrors.time && <p className="text-xs text-destructive">{fieldErrors.time}</p>}
          </div>
        </div>
        {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <div className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
            <div className="flex gap-3">
              <Checkbox
                id="offer-accepted"
                checked={acceptedOffer}
                onCheckedChange={(checked) => {
                  setAcceptedOffer(checked === true)
                  if (checked === true) {
                    setFieldErrors((prev) => {
                      const next = { ...prev }
                      delete next.offerAccepted
                      return next
                    })
                  }
                }}
                aria-invalid={Boolean(fieldErrors.offerAccepted)}
                className="mt-0.5"
              />
              <Label htmlFor="offer-accepted" className="cursor-pointer text-sm font-normal leading-snug">
                <span className="text-destructive">*</span>{" "}
                Я принимаю условия{" "}
                <a
                  href={OFFER_PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary underline underline-offset-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  Публичной оферты
                </a>{" "}
                сервиса Mise и даю согласие на обработку моих персональных данных (имени, фамилии и
                номера телефона) ООО «Найтколл» и ООО «ХАРАТСБЕЛ» в целях бронирования столика.
              </Label>
            </div>
            {fieldErrors.offerAccepted && (
              <p className="text-xs text-destructive">{fieldErrors.offerAccepted}</p>
            )}
            <div className="flex gap-3">
              <Checkbox
                id="marketing-consent"
                checked={marketingConsent}
                onCheckedChange={(checked) => setMarketingConsent(checked === true)}
                className="mt-0.5"
              />
              <Label htmlFor="marketing-consent" className="cursor-pointer text-sm font-normal leading-snug">
                Я даю согласие на получение информационных и рекламных сообщений от сервиса Mise и
                заведения Harats Irish Pub Grodno.
              </Label>
            </div>
          </div>

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

      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Проверьте бронирование</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-left text-foreground">
                <p className="text-sm text-muted-foreground">
                  Убедитесь, что всё указано верно. При необходимости нажмите «Изменить» и поправьте данные в форме.
                </p>
                {selectedSlot?.confirmation_mode === "manual" && (
                  <p className="text-sm text-amber-700 dark:text-amber-500">
                    Для этого времени нужно подтверждение ресторана — после этого шага мы покажем ещё одно
                    напоминание.
                  </p>
                )}
                <dl className="space-y-2 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Имя</dt>
                    <dd className="text-right font-medium">
                      {formData.firstName} {formData.lastName}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Телефон</dt>
                    <dd className="text-right font-medium">{formData.phone.trim()}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Дата</dt>
                    <dd className="text-right font-medium">{reviewDateFormatted}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Время</dt>
                    <dd className="text-right font-medium">{formData.time}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Гостей</dt>
                    <dd className="text-right font-medium">{formData.guests}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Сеты</dt>
                    <dd className="text-right font-medium">
                      {formData.set === SETS_FORM_NONE || !isSetsChoiceAllowed
                        ? "Без сетов"
                        : formData.set}
                    </dd>
                  </div>
                </dl>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl sm:w-auto"
              onClick={handleReviewChange}
            >
              Изменить
            </Button>
            <Button type="button" className="w-full rounded-xl sm:w-auto" onClick={handleReviewConfirm}>
              Забронировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
