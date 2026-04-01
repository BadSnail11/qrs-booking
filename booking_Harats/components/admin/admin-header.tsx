"use client"

import { format, addDays, subDays } from "date-fns"
import { ru } from "date-fns/locale"
import { Search, CalendarIcon, ChevronLeft, ChevronRight, BarChart3, Menu, Bell, Armchair, Clock3, RefreshCw, Send } from "lucide-react"
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
  selectedDate: Date
  onDateChange: (date: Date) => void
  onAnalyticsClick: () => void
  onManageTablesClick: () => void
  onManageScheduleClick: () => void
  onManageTelegramClick: () => void
  onRefreshClick: () => void
  pendingCount?: number
  onToggleSidebar?: () => void
}

export function AdminHeader({
  searchQuery,
  onSearchChange,
  selectedDate,
  onDateChange,
  onAnalyticsClick,
  onManageTablesClick,
  onManageScheduleClick,
  onManageTelegramClick,
  onRefreshClick,
  pendingCount = 0,
  onToggleSidebar,
}: AdminHeaderProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(selectedDate, i - 3))

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
            <span className="text-muted-foreground">Tables</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Pending notifications - mobile */}
          {pendingCount > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9"
              onClick={onToggleSidebar}
            >
              <Bell className="h-5 w-5" />
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-pink-500 text-[10px] font-medium text-white">
                {pendingCount}
              </span>
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={onRefreshClick}
            className="hidden gap-2 sm:flex"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden md:inline">Обновить</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onManageScheduleClick}
            className="hidden gap-2 sm:flex"
          >
            <Clock3 className="h-4 w-4" />
            <span className="hidden md:inline">График</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onManageTelegramClick}
            className="hidden gap-2 sm:flex"
          >
            <Send className="h-4 w-4" />
            <span className="hidden md:inline">Telegram</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onManageTablesClick}
            className="hidden gap-2 sm:flex"
          >
            <Armchair className="h-4 w-4" />
            <span className="hidden md:inline">Столы</span>
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
            onClick={onRefreshClick}
            className="h-9 w-9 sm:hidden"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={onManageScheduleClick}
            className="h-9 w-9 sm:hidden"
          >
            <Clock3 className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={onManageTelegramClick}
            className="h-9 w-9 sm:hidden"
          >
            <Send className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={onManageTablesClick}
            className="h-9 w-9 sm:hidden"
          >
            <Armchair className="h-4 w-4" />
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
                selected={selectedDate}
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
            onClick={() => onDateChange(subDays(selectedDate, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Scrollable date pills */}
          <div className="flex flex-1 gap-1 overflow-x-auto scrollbar-hide">
            {days.map((day, index) => {
              const isSelected = day.toDateString() === selectedDate.toDateString()
              const isToday = day.toDateString() === new Date().toDateString()
              
              return (
                <button
                  key={index}
                  onClick={() => onDateChange(day)}
                  className={cn(
                    "flex shrink-0 flex-col items-center rounded-lg px-2.5 py-1.5 text-sm transition-colors sm:px-3 sm:py-2",
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
            onClick={() => onDateChange(addDays(selectedDate, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  )
}
