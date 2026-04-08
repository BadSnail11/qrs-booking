"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { BookingForm } from "@/components/booking-form"
import { RestaurantPicker } from "@/components/restaurant-picker"
import { userApi, type GuestContactPublic } from "@/lib/api"
import type { SetsChoiceInterval } from "@/lib/booking-limits"
import { FileText, ArrowUpRight } from "lucide-react"

const USER_API_BASE = process.env.NEXT_PUBLIC_USER_API_URL || "/api/user"

function guestPhoneHref(phone: string): string {
  const t = phone.trim()
  const compact = t.replace(/[\s().-]/g, "")
  if (compact.startsWith("+")) {
    return `tel:${compact}`
  }
  const digits = t.replace(/\D/g, "")
  if (digits.length >= 8) {
    return `tel:+${digits}`
  }
  return `tel:${encodeURIComponent(t)}`
}

function hasGuestContactBlock(c: GuestContactPublic | null | undefined): boolean {
  if (!c) return false
  return Boolean((c.address && c.address.trim()) || (c.phone && c.phone.trim()) || (c.hours && c.hours.trim()))
}

function defaultGuestFooterLine() {
  return `© ${new Date().getFullYear()} Ресторан. Все права защищены.`
}

function PickerLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="px-5 py-8">
        <div className="mb-0 text-center">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground text-balance">
            Выберите ресторан
          </h1>
          <p className="text-sm text-muted-foreground">
            После выбора откроется форма бронирования
          </p>
        </div>
      </div>
      <main className="flex-1 px-5 pb-8">
        <RestaurantPicker />
      </main>
      <footer className="px-5 pb-8 pt-2">
        <p className="text-center text-xs text-muted-foreground">{defaultGuestFooterLine()}</p>
      </footer>
    </div>
  )
}

function BookingLayout({
  restaurantSlug,
  menuPdfHref,
  guestContact,
  setsChoiceIntervals,
}: {
  restaurantSlug: string
  menuPdfHref: string | null
  guestContact: GuestContactPublic | null
  setsChoiceIntervals: SetsChoiceInterval[]
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="px-5 py-8">
        <div className="mb-0 text-center">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground text-balance">
            Забронировать столик
          </h1>
          <p className="text-sm text-muted-foreground">Выберите удобное время и дату</p>
        </div>
      </div>

      <main className="flex-1 px-5">
        {menuPdfHref ? (
          <a
            href={menuPdfHref}
            target="_blank"
            rel="noopener noreferrer"
            className="group mb-8 flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all active:scale-[0.98]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">Меню ресторана</p>
              <p className="text-sm text-muted-foreground">Ознакомьтесь перед визитом</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary transition-colors group-active:bg-primary/10">
              <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-active:text-primary" />
            </div>
          </a>
        ) : null}

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <BookingForm restaurantSlug={restaurantSlug} setsChoiceIntervals={setsChoiceIntervals} />
        </div>
      </main>

      {hasGuestContactBlock(guestContact) ? (
        <div className="mt-8 px-5 pb-6">
          <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
            <p className="mb-4 text-xs font-medium uppercase tracking-widest opacity-70">Контакты</p>
            <div className="space-y-3">
              {guestContact!.address?.trim() ? (
                <div className="flex items-start justify-between gap-4">
                  <span className="shrink-0 text-sm opacity-70">Адрес</span>
                  <span className="text-right text-sm font-medium">{guestContact!.address.trim()}</span>
                </div>
              ) : null}
              {guestContact!.phone?.trim() ? (
                <div className="flex items-start justify-between gap-4">
                  <span className="shrink-0 text-sm opacity-70">Телефон</span>
                  <a
                    href={guestPhoneHref(guestContact!.phone)}
                    className="text-right text-sm font-medium underline underline-offset-2"
                  >
                    {guestContact!.phone.trim()}
                  </a>
                </div>
              ) : null}
              {guestContact!.hours?.trim() ? (
                <div className="flex items-start justify-between gap-4">
                  <span className="shrink-0 text-sm opacity-70">Режим заведения</span>
                  <span className="text-right text-sm font-medium whitespace-pre-line">
                    {guestContact!.hours.trim()}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <footer className="px-5 pb-8 pt-2">
        <p className="text-center text-xs text-muted-foreground">{defaultGuestFooterLine()}</p>
      </footer>
    </div>
  )
}

export function HomeContent() {
  const searchParams = useSearchParams()
  const restaurantSlug = useMemo(() => searchParams.get("restaurant")?.trim() ?? "", [searchParams])
  const [menuPdfHref, setMenuPdfHref] = useState<string | null>(null)
  const [guestContact, setGuestContact] = useState<GuestContactPublic | null>(null)
  const [setsChoiceIntervals, setSetsChoiceIntervals] = useState<SetsChoiceInterval[]>([])

  useEffect(() => {
    if (!restaurantSlug) return
    let cancelled = false
    void userApi
      .listRestaurants()
      .then((rows) => {
        if (cancelled) return
        const r = rows.find((x) => x.slug === restaurantSlug)
        const path = r?.menuUrl
        setMenuPdfHref(path ? `${USER_API_BASE}${path}` : null)
        setGuestContact(r?.guestContact ?? null)
        setSetsChoiceIntervals(r?.setsChoiceIntervals ?? [])
      })
      .catch(() => {
        if (!cancelled) {
          setMenuPdfHref(null)
          setGuestContact(null)
          setSetsChoiceIntervals([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [restaurantSlug])

  if (!restaurantSlug) {
    return <PickerLayout />
  }

  return (
    <BookingLayout
      restaurantSlug={restaurantSlug}
      menuPdfHref={menuPdfHref}
      guestContact={guestContact}
      setsChoiceIntervals={setsChoiceIntervals}
    />
  )
}
