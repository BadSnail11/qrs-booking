"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarIcon, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import type { Table } from "@/app/admin/page"
import { adminApi } from "@/lib/api"

interface BlockTableModalProps {
  isOpen: boolean
  onClose: () => void
  table: Table | null
  onSuccess?: () => void
}

const timeSlots = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30", "22:00", "23:00",
]

export function BlockTableModal({
  isOpen,
  onClose,
  table,
  onSuccess,
}: BlockTableModalProps) {
  const [date, setDate] = useState<Date>()
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [reason, setReason] = useState("")
  const [submitError, setSubmitError] = useState("")

  const handleBlock = async () => {
    if (!table || !date || !startTime || !endTime) return
    setSubmitError("")
    try {
      const dateStr = format(date, "yyyy-MM-dd")
      await adminApi.createTableBlock({
        table_id: table.id,
        start_time: `${dateStr}T${startTime}:00`,
        end_time: `${dateStr}T${endTime}:00`,
        reason,
      })
      onSuccess?.()
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось заблокировать стол")
    }
  }

  if (!table) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Заблокировать {table.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Время начала</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger>
                  <SelectValue placeholder="От" />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map((time) => (
                    <SelectItem key={time} value={time}>{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Время окончания</Label>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger>
                  <SelectValue placeholder="До" />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map((time) => (
                    <SelectItem key={time} value={time}>{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Причина (необязательно)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Например: Техническое обслуживание"
            />
          </div>
        </div>

        {submitError && <div className="text-sm text-destructive">{submitError}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => void handleBlock()} className="bg-red-500 hover:bg-red-600">
            Заблокировать
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
