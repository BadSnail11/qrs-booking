"use client"

import { useEffect, useMemo, useState } from "react"
import { format, subDays, startOfMonth, endOfMonth } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarIcon, Download, BarChart3, Users, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { cn } from "@/lib/utils"
import type { Booking } from "@/app/admin/page"
import { adminApi } from "@/lib/api"

interface AnalyticsModalProps {
  isOpen: boolean
  onClose: () => void
  bookings: Booking[]
}

type PeriodType = "today" | "week" | "month" | "custom"
type FilterType = "all" | "confirmed" | "pending" | "cancelled"

export function AnalyticsModal({
  isOpen,
  onClose,
  bookings: _bookings,
}: AnalyticsModalProps) {
  const [period, setPeriod] = useState<PeriodType>("month")
  const [filterType, setFilterType] = useState<FilterType>("all")
  const [customStartDate, setCustomStartDate] = useState<Date>()
  const [customEndDate, setCustomEndDate] = useState<Date>()
  const [analytics, setAnalytics] = useState<{ total: number; total_sets: number; by_status: Record<string, number>; rows: Booking[] } | null>(null)

  const { startDate, endDate } = useMemo(() => {
    const today = new Date()
    switch (period) {
      case "today":
        return { startDate: today, endDate: today }
      case "week":
        return { startDate: subDays(today, 7), endDate: today }
      case "month":
        return { startDate: startOfMonth(today), endDate: endOfMonth(today) }
      case "custom":
        return { 
          startDate: customStartDate || today, 
          endDate: customEndDate || today 
        }
      default:
        return { startDate: today, endDate: today }
    }
  }, [period, customStartDate, customEndDate])

  useEffect(() => {
    if (!isOpen) return
    const params = new URLSearchParams({
      from: `${format(startDate, "yyyy-MM-dd")}T00:00:00`,
      to: `${format(endDate, "yyyy-MM-dd")}T23:59:59`,
    })
    if (filterType !== "all") params.set("status", filterType)
    void adminApi.getAnalytics(params).then((data) => {
      setAnalytics(data as { total: number; total_sets: number; by_status: Record<string, number>; rows: Booking[] })
    })
  }, [isOpen, startDate, endDate, filterType])

  const stats = useMemo(() => {
    const rows = analytics?.rows || []
    const totalBookings = analytics?.total || 0
    const totalGuests = rows.reduce((sum, b) => sum + b.guests, 0)
    const totalSets = analytics?.total_sets || 0
    const confirmed = analytics?.by_status?.confirmed || 0
    const pending = analytics?.by_status?.pending || 0
    const avgGuests = totalBookings > 0 ? (totalGuests / totalBookings).toFixed(1) : 0

    const byTable: Record<number, number> = {}
    rows.forEach((b) => {
      byTable[b.tableId] = (byTable[b.tableId] || 0) + 1
    })

    const popularTable = Object.entries(byTable).sort((a, b) => b[1] - a[1])[0]

    return {
      totalBookings,
      totalGuests,
      totalSets,
      confirmed,
      pending,
      avgGuests,
      popularTable: popularTable ? { id: popularTable[0], count: popularTable[1] } : null,
    }
  }, [analytics])

  const exportData = (exportFormat: "csv" | "json" | "xlsx") => {
    const rows = analytics?.rows || []
    const data = rows.map((b) => ({
      "Имя": b.firstName,
      "Фамилия": b.lastName,
      "Телефон": b.phone,
      "Email": b.email || "",
      "Дата": b.date,
      "Время": `${b.time} - ${b.endTime}`,
      "Гости": b.guests,
      "Сеты": b.sets,
      "Стол": b.tableId,
      "Статус": b.status,
      "Примечание": b.note || "",
    }))

    if (exportFormat === "json") {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      downloadBlob(blob, `bookings-${format(new Date(), "yyyy-MM-dd")}.json`)
    } else if (exportFormat === "csv" && data.length > 0) {
      const headers = Object.keys(data[0] || {}).join(",")
      const rows = data.map(row => Object.values(row).join(",")).join("\n")
      const csv = `${headers}\n${rows}`
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      downloadBlob(blob, `bookings-${format(new Date(), "yyyy-MM-dd")}.csv`)
    }
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Аналитика бронирований
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Период</label>
              <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Сегодня</SelectItem>
                  <SelectItem value="week">Неделя</SelectItem>
                  <SelectItem value="month">Месяц</SelectItem>
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
                        className={cn(
                          "w-40 justify-start text-left font-normal",
                          !customStartDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customStartDate ? format(customStartDate, "d MMM", { locale: ru }) : "Выбрать"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={customStartDate}
                        onSelect={setCustomStartDate}
                        locale={ru}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">По</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-40 justify-start text-left font-normal",
                          !customEndDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customEndDate ? format(customEndDate, "d MMM", { locale: ru }) : "Выбрать"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={customEndDate}
                        onSelect={setCustomEndDate}
                        locale={ru}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Тип</label>
              <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
                <SelectTrigger className="w-40">
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

          {/* Stats Cards */}
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

          {/* Status breakdown */}
          <div className="rounded-xl border border-border p-4">
            <h3 className="mb-4 font-medium">По статусу</h3>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="text-sm">Подтверждено: {stats.confirmed}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-yellow-500" />
                <span className="text-sm">Ожидает: {stats.pending}</span>
              </div>
            </div>
          </div>

          {/* Popular table */}
          {stats.popularTable && (
            <div className="rounded-xl border border-border p-4">
              <h3 className="mb-2 font-medium">Самый популярный стол</h3>
              <div className="text-lg">
                Стол {stats.popularTable.id} — {stats.popularTable.count} бронирований
              </div>
            </div>
          )}

          {/* Export */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => exportData("csv")} className="gap-2">
              <Download className="h-4 w-4" />
              Скачать CSV
            </Button>
            <Button variant="outline" onClick={() => exportData("json")} className="gap-2">
              <Download className="h-4 w-4" />
              Скачать JSON
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
