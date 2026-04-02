"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns"
import { ru } from "date-fns/locale"
import { ArrowLeft, BarChart3, CalendarIcon, TrendingUp, Users } from "lucide-react"
import type { Booking } from "@/app/admin/page"
import { adminApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type PeriodType = "today" | "week" | "month" | "custom"
type FilterType = "all" | "confirmed" | "pending" | "cancelled"

type AnalyticsResponse = {
  total: number
  total_sets: number
  by_status: Record<string, number>
  rows: Booking[]
}

export function AdminAnalyticsPageClient() {
  const [period, setPeriod] = useState<PeriodType>("month")
  const [filterType, setFilterType] = useState<FilterType>("all")
  const [customStartDate, setCustomStartDate] = useState<Date>()
  const [customEndDate, setCustomEndDate] = useState<Date>()
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null)
  const [error, setError] = useState("")

  const { startDate, endDate } = useMemo(() => {
    const today = new Date()
    switch (period) {
      case "today":
        return { startDate: today, endDate: today }
      case "week":
        return {
          startDate: startOfWeek(today, { weekStartsOn: 1 }),
          endDate: endOfWeek(today, { weekStartsOn: 1 }),
        }
      case "month":
        return {
          startDate: startOfMonth(today),
          endDate: endOfMonth(today),
        }
      case "custom":
        return {
          startDate: customStartDate || today,
          endDate: customEndDate || customStartDate || today,
        }
      default:
        return { startDate: today, endDate: today }
    }
  }, [period, customStartDate, customEndDate])

  useEffect(() => {
    const params = new URLSearchParams({
      from: `${format(startDate, "yyyy-MM-dd")}T00:00:00`,
      to: `${format(endDate, "yyyy-MM-dd")}T23:59:59`,
    })
    if (filterType !== "all") params.set("status", filterType)
    setError("")
    void adminApi.getAnalytics(params)
      .then((data) => setAnalytics(data as AnalyticsResponse))
      .catch((err) => setError(err instanceof Error ? err.message : "Не удалось загрузить аналитику"))
  }, [startDate, endDate, filterType])

  const stats = useMemo(() => {
    const rows = analytics?.rows || []
    const totalBookings = analytics?.total || 0
    const totalGuests = rows.reduce((sum, booking) => sum + booking.guests, 0)
    const totalSets = analytics?.total_sets || 0
    const confirmed = analytics?.by_status?.confirmed || 0
    const pending = analytics?.by_status?.pending || 0
    const cancelled = analytics?.by_status?.cancelled || 0
    const avgGuests = totalBookings > 0 ? (totalGuests / totalBookings).toFixed(1) : "0"

    return {
      totalBookings,
      totalGuests,
      totalSets,
      confirmed,
      pending,
      cancelled,
      avgGuests,
    }
  }, [analytics])

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon">
              <Link href="/admin">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">Аналитика</h1>
              <p className="text-sm text-muted-foreground">Статистика по бронированиям</p>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl p-4 lg:p-6">
        <div className="mb-6 flex flex-wrap gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Период</label>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Сегодня</SelectItem>
                <SelectItem value="week">Текущая неделя</SelectItem>
                <SelectItem value="month">Текущий месяц</SelectItem>
                <SelectItem value="custom">Свой период</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {period === "custom" && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">С</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-44 justify-start text-left font-normal", !customStartDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customStartDate ? format(customStartDate, "d MMM yyyy", { locale: ru }) : "Выбрать дату"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={customStartDate} onSelect={setCustomStartDate} locale={ru} />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">По</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-44 justify-start text-left font-normal", !customEndDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customEndDate ? format(customEndDate, "d MMM yyyy", { locale: ru }) : "Выбрать дату"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={customEndDate} onSelect={setCustomEndDate} locale={ru} />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Тип</label>
            <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="confirmed">Подтверждённые</SelectItem>
                <SelectItem value="pending">Ожидающие</SelectItem>
                <SelectItem value="cancelled">Отменённые</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BarChart3 className="h-4 w-4" />
              Всего бронирований
            </div>
            <div className="mt-2 text-3xl font-bold">{stats.totalBookings}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              Всего гостей
            </div>
            <div className="mt-2 text-3xl font-bold">{stats.totalGuests}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Среднее гостей
            </div>
            <div className="mt-2 text-3xl font-bold">{stats.avgGuests}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Всего сетов
            </div>
            <div className="mt-2 text-3xl font-bold">{stats.totalSets}</div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card p-4">
          <h3 className="mb-4 font-medium">По статусу</h3>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-sm">Подтверждено: {stats.confirmed}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-yellow-500" />
              <span className="text-sm">Ожидает: {stats.pending}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-slate-400" />
              <span className="text-sm">Отменено: {stats.cancelled}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
