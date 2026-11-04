"use client"

import { useEffect, useState } from "react"
import { format, parseISO } from "date-fns"
import { ru } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { adminApi, type OnlineGuestLimit } from "@/lib/api"

type LimitRow = OnlineGuestLimit & { id: number }

export function OnlineGuestLimitsSettings() {
  const [rows, setRows] = useState<LimitRow[]>([])
  const [newDate, setNewDate] = useState("")
  const [newMax, setNewMax] = useState("6")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const load = async () => {
    try {
      setRows(await adminApi.getOnlineGuestLimits())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить ограничения")
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleAdd = async () => {
    const maxGuests = parseInt(newMax, 10)
    if (!newDate || !Number.isFinite(maxGuests) || maxGuests < 1) {
      setError("Укажите дату и максимальное число гостей.")
      return
    }
    setError("")
    setSaving(true)
    try {
      await adminApi.upsertOnlineGuestLimit({ date: newDate, maxGuests })
      setNewDate("")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить ограничение")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    setError("")
    try {
      await adminApi.deleteOnlineGuestLimit(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить ограничение")
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div>
          <h3 className="text-sm font-medium">Ограничение онлайн-брони по числу гостей</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            В эти даты гости на сайте смогут забронировать стол только на указанное число человек. Для большей
            компании форма предложит позвонить по телефону из блока «Контакты». Админка ограничение не проверяет.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="guest-limit-date">Дата</Label>
            <Input id="guest-limit-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guest-limit-max">Максимум гостей онлайн</Label>
            <Input
              id="guest-limit-max"
              type="number"
              min={1}
              max={15}
              value={newMax}
              onChange={(e) => setNewMax(e.target.value)}
            />
          </div>
          <Button type="button" className="w-full md:w-auto" disabled={saving} onClick={() => void handleAdd()}>
            {saving ? "Сохранение…" : "Добавить дату"}
          </Button>
        </div>
        {error && <div className="text-sm text-destructive">{error}</div>}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Ограничений нет.
        </div>
      ) : (
        rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="text-sm">
              <span className="font-medium">{format(parseISO(row.date), "d MMMM yyyy", { locale: ru })}</span>
              <span className="text-muted-foreground"> — онлайн не более {row.maxGuests} гостей</span>
            </div>
            <Button type="button" variant="destructive" size="sm" onClick={() => void handleDelete(row.id)}>
              Удалить
            </Button>
          </div>
        ))
      )}
    </div>
  )
}
