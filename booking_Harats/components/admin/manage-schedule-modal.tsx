"use client"

import { useEffect, useState } from "react"
import type { ScheduleDay } from "@/app/admin/page"
import { adminApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface ManageScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  schedule: ScheduleDay[]
  onSaved: () => void
}

const dayLabels: Record<string, string> = {
  monday: "Понедельник",
  tuesday: "Вторник",
  wednesday: "Среда",
  thursday: "Четверг",
  friday: "Пятница",
  saturday: "Суббота",
  sunday: "Воскресенье",
}

const TIME_24H_PATTERN = "^([01]\\d|2[0-3]):([0-5]\\d)$"

type ScheduleDraft = {
  isOpen: boolean
  openTime: string
  closeTime: string
}

export function ManageScheduleModal({
  isOpen,
  onClose,
  schedule,
  onSaved,
}: ManageScheduleModalProps) {
  const [drafts, setDrafts] = useState<Record<number, ScheduleDraft>>({})
  const [submitError, setSubmitError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const nextDrafts: Record<number, ScheduleDraft> = {}
    schedule.forEach((day) => {
      nextDrafts[day.weekday] = {
        isOpen: day.isOpen,
        openTime: day.openTime || "11:00",
        closeTime: day.closeTime || "22:00",
      }
    })
    setDrafts(nextDrafts)
  }, [schedule, isOpen])

  const updateDraft = (weekday: number, patch: Partial<ScheduleDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [weekday]: {
        ...prev[weekday],
        ...patch,
      },
    }))
  }

  const handleSaveAll = async () => {
    setSubmitError("")
    setIsSaving(true)
    try {
      await Promise.all(
        schedule.map((day) => {
          const draft = drafts[day.weekday]
          if (!draft) return Promise.resolve()
          return adminApi.updateScheduleDay(day.weekday, {
            is_open: draft.isOpen,
            open_time: draft.openTime,
            close_time: draft.closeTime,
          })
        })
      )
      onSaved()
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось сохранить график")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>График бронирований</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {schedule.map((day) => {
            const draft = drafts[day.weekday]
            if (!draft) return null

            return (
              <div
                key={day.weekday}
                className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-[minmax(180px,1fr)_120px_1fr_1fr]"
              >
                <div className="space-y-1">
                  <div className="font-medium">{dayLabels[day.dayName] || day.dayName}</div>
                  <div className="text-xs text-muted-foreground">{day.dayName}</div>
                </div>
                <div className="space-y-2">
                  <Label>Открыто</Label>
                  <div className="flex h-10 items-center">
                    <Switch
                      checked={draft.isOpen}
                      onCheckedChange={(checked) => updateDraft(day.weekday, { isOpen: checked })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>С</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="11:00"
                    pattern={TIME_24H_PATTERN}
                    title="Формат времени: ЧЧ:ММ"
                    value={draft.openTime}
                    onChange={(e) => updateDraft(day.weekday, { openTime: e.target.value })}
                    disabled={!draft.isOpen}
                  />
                </div>
                <div className="space-y-2">
                  <Label>До</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="22:00"
                    pattern={TIME_24H_PATTERN}
                    title="Формат времени: ЧЧ:ММ"
                    value={draft.closeTime}
                    onChange={(e) => updateDraft(day.weekday, { closeTime: e.target.value })}
                    disabled={!draft.isOpen}
                  />
                </div>
              </div>
            )
          })}

          {submitError && <div className="text-sm text-destructive">{submitError}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Закрыть
          </Button>
          <Button onClick={() => void handleSaveAll()} disabled={isSaving}>
            Сохранить все
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
