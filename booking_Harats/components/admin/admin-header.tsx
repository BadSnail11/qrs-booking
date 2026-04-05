"use client"

import { format, addDays } from "date-fns"
import { ru } from "date-fns/locale"
import { Search, CalendarIcon, ChevronLeft, ChevronRight, BarChart3, Menu, Settings } from "lucide-react"
import { AdminLogoutButton } from "@/components/admin/admin-logout-button"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface AdminHeaderProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  /** Center of the 7-day strip; used when no day is explicitly selected */
  weekAnchor: Date
  /** Null = no day chosen (list shows all bookings); grid/sidebar use weekAnchor for the day */
  selectedDate: Date | null
  /** Calendar and choosing a day from the strip (except pill handler) */
  onDateChange: (date: Date) => void
  /** Date lineup pills — list view: second click on selected day clears selection */
  onDatePillClick: (day: Date) => void
  /** Prev/next day: shifts selected day, or only the strip when nothing selected */
  onShiftDay: (delta: number) => void
  mobileView?: "list" | "grid"
  onAnalyticsClick: () => void
  onSettingsClick: () => void
  onToggleSidebar?: () => void
  /** Shown next to the app name (restaurant display name from session) */
  venueTitle?: string
}

export function AdminHeader({
  searchQuery,
  onSearchChange,
  weekAnchor,
  selectedDate,
  onDateChange,
  onDatePillClick,
  onShiftDay,
  mobileView = "list",
  onAnalyticsClick,
  onSettingsClick,
  onToggleSidebar,
  venueTitle,
}: AdminHeaderProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i - 3))

  return (
    <header className="border-b border-border bg-card">
      {/* Top bar - mobile */}
      <div className="flex items-center justify-between px-4 py-3 lg:px-6 lg:py-4">
        <div className="flex items-center gap-3">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 lg:hidden"
            onClick={onToggleSidebar}
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          <h1 className="text-xl font-semibold lg:text-2xl">
            <span className="text-muted-foreground">
              {venueTitle ? `${venueTitle} · бронирование` : "Админка бронирований"}
            </span>
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          <AdminLogoutButton className="hidden sm:flex" />
          <AdminLogoutButton size="icon" compact className="sm:hidden" />
          <Button
            variant="outline"
            size="sm"
            onClick={onSettingsClick}
            className="hidden gap-2 sm:flex"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden md:inline">Настройки</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onAnalyticsClick}
            className="hidden gap-2 sm:flex"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="hidden md:inline">Аналитика</span>
          </Button>
          
          {/* Mobile analytics icon */}
          <Button
            variant="outline"
            size="icon"
            onClick={onSettingsClick}
            className="h-9 w-9 sm:hidden"
          >
            <Settings className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={onAnalyticsClick}
            className="h-9 w-9 sm:hidden"
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Search and date navigation */}
      <div className="space-y-3 px-4 pb-4 lg:px-6">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Поиск по имени или телефону"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 rounded-full border-border bg-background pl-10 text-base"
          />
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-2">
          {/* Calendar picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-lg">
                <CalendarIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate ?? undefined}
                onSelect={(date) => date && onDateChange(date)}
                locale={ru}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            type="button"
            onClick={() => onShiftDay(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Scrollable date pills */}
          <div className="flex flex-1 gap-1 overflow-x-auto scrollbar-hide lg:grid lg:grid-cols-7 lg:overflow-visible">
            {days.map((day, index) => {
              const isSelected =
                selectedDate !== null && day.toDateString() === selectedDate.toDateString()
              const isToday = day.toDateString() === new Date().toDateString()

              return (
                <button
                  type="button"
                  key={index}
                  onClick={() => onDatePillClick(day)}
                  title={
                    mobileView === "list" && isSelected
                      ? "Нажмите ещё раз, чтобы снять выбор даты"
                      : undefined
                  }
                  className={cn(
                    "flex shrink-0 flex-col items-center rounded-lg px-2.5 py-1.5 text-sm transition-colors sm:px-3 sm:py-2 lg:w-full",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : isToday
                      ? "bg-muted text-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  <span className="text-[10px] font-medium uppercase sm:text-xs">
                    {format(day, "EEE", { locale: ru })}
                  </span>
                  <span className="text-xs sm:text-sm">
                    {format(day, "d", { locale: ru })}
                  </span>
                </button>
              )
            })}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            type="button"
            onClick={() => onShiftDay(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  )
}
