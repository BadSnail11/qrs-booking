"use client"

import { type ChangeEvent, useEffect, useState } from "react"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { ru } from "date-fns/locale"
import { useRouter } from "next/navigation"
import { ArrowLeft, Armchair, CalendarRange, Clock3, FileText, Send, UtensilsCrossed } from "lucide-react"
import { AdminLogoutButton } from "@/components/admin/admin-logout-button"
import type { ScheduleDay, Table } from "@/app/admin/page"
import { adminApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type TableDraft = {
  name: string
  maxCapacity: string
  isActive: boolean
  canUnite: boolean
  uniteWithTableId: string
}

type ScheduleDraft = {
  isOpen: boolean
  openTime: string
  closeTime: string
}

type TelegramRecipient = {
  id: number
  chatId: string
  label?: string
  isActive: boolean
}

type ScheduleOverrideRow = {
  date: string
  isOpen: boolean
  openTime: string | null
  closeTime: string | null
}

type SetsChoiceIntervalRow = {
  id: number
  dateStart: string
  dateEnd: string
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

export function AdminSettingsPageClient({
  initialTab,
}: {
  initialTab: "tables" | "schedule" | "dates" | "sets" | "telegram" | "menu"
}) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState(initialTab)
  const [tables, setTables] = useState<Table[]>([])
  const [schedule, setSchedule] = useState<ScheduleDay[]>([])
  const [recipients, setRecipients] = useState<TelegramRecipient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [tablesError, setTablesError] = useState("")
  const [scheduleError, setScheduleError] = useState("")
  const [telegramError, setTelegramError] = useState("")
  const [isSavingTables, setIsSavingTables] = useState(false)
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)
  const [isSavingRecipient, setIsSavingRecipient] = useState(false)
  const [isAddingTable, setIsAddingTable] = useState(false)
  const [newName, setNewName] = useState("")
  const [newCapacity, setNewCapacity] = useState("2")
  const [newCanUnite, setNewCanUnite] = useState(false)
  const [newUniteWithTableId, setNewUniteWithTableId] = useState("")
  const [tableDrafts, setTableDrafts] = useState<Record<number, TableDraft>>({})
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<number, ScheduleDraft>>({})
  const [recipientLabel, setRecipientLabel] = useState("")
  const [recipientChatId, setRecipientChatId] = useState("")
  const [menuHas, setMenuHas] = useState(false)
  const [menuPublicPath, setMenuPublicPath] = useState<string | null>(null)
  const [menuError, setMenuError] = useState("")
  const [menuUploading, setMenuUploading] = useState(false)
  const [menuDeleting, setMenuDeleting] = useState(false)
  const [publicFooterText, setPublicFooterText] = useState("")
  const [savingFooter, setSavingFooter] = useState(false)
  const [footerSettingsError, setFooterSettingsError] = useState("")
  const [guestContactAddress, setGuestContactAddress] = useState("")
  const [guestContactPhone, setGuestContactPhone] = useState("")
  const [guestContactHours, setGuestContactHours] = useState("")
  const [savingGuestContact, setSavingGuestContact] = useState(false)
  const [guestContactSettingsError, setGuestContactSettingsError] = useState("")
  const [scheduleOverrides, setScheduleOverrides] = useState<ScheduleOverrideRow[]>([])
  const [scheduleOverridesError, setScheduleOverridesError] = useState("")
  const [overrideFormDate, setOverrideFormDate] = useState("")
  const [overrideFormOpen, setOverrideFormOpen] = useState(true)
  const [overrideFormOpenTime, setOverrideFormOpenTime] = useState("12:00")
  const [overrideFormCloseTime, setOverrideFormCloseTime] = useState("22:00")
  const [savingOverride, setSavingOverride] = useState(false)
  const [setsChoiceIntervals, setSetsChoiceIntervals] = useState<SetsChoiceIntervalRow[]>([])
  const [setsIntervalsError, setSetsIntervalsError] = useState("")
  const [newSetsStart, setNewSetsStart] = useState("")
  const [newSetsEnd, setNewSetsEnd] = useState("")
  const [savingSetsInterval, setSavingSetsInterval] = useState(false)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  const loadData = async () => {
    setIsLoading(true)
    setError("")
    try {
      const [
        tablesData,
        scheduleData,
        recipientsData,
        menuData,
        overridesData,
        footerData,
        guestContactData,
        setsData,
      ] = await Promise.all([
        adminApi.getTables(format(new Date(), "yyyy-MM-dd")),
        adminApi.getSchedule(),
        adminApi.getTelegramRecipients(),
        adminApi.getMenuSettings(),
        adminApi.listScheduleOverrides(),
        adminApi.getPublicFooter(),
        adminApi.getPublicGuestContact(),
        adminApi.getSetsChoiceIntervals(),
      ])
      const nextTables = tablesData as Table[]
      const nextSchedule = scheduleData as ScheduleDay[]
      setTables(nextTables)
      setSchedule(nextSchedule)
      setRecipients(recipientsData as TelegramRecipient[])
      setMenuHas(Boolean(menuData.hasMenu))
      setMenuPublicPath(menuData.menuUrl)
      setPublicFooterText(footerData.footerText ?? "")
      setGuestContactAddress(guestContactData.address ?? "")
      setGuestContactPhone(guestContactData.phone ?? "")
      setGuestContactHours(guestContactData.hours ?? "")
      setScheduleOverrides(overridesData as ScheduleOverrideRow[])
      setSetsChoiceIntervals(setsData as SetsChoiceIntervalRow[])

      const nextTableDrafts: Record<number, TableDraft> = {}
      nextTables.forEach((table) => {
        nextTableDrafts[table.id] = {
          name: table.name,
          maxCapacity: String(table.maxCapacity),
          isActive: table.isActive ?? true,
          canUnite: table.canUnite ?? false,
          uniteWithTableId: table.uniteWithTableId ? String(table.uniteWithTableId) : "",
        }
      })
      setTableDrafts(nextTableDrafts)

      const nextScheduleDrafts: Record<number, ScheduleDraft> = {}
      nextSchedule.forEach((day) => {
        nextScheduleDrafts[day.weekday] = {
          isOpen: day.isOpen,
          openTime: day.openTime || "11:00",
          closeTime: day.closeTime || "22:00",
        }
      })
      setScheduleDrafts(nextScheduleDrafts)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить настройки")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const setTab = (tab: string) => {
    if (
      tab !== "tables" &&
      tab !== "schedule" &&
      tab !== "dates" &&
      tab !== "sets" &&
      tab !== "telegram" &&
      tab !== "menu"
    )
      return
    setActiveTab(tab)
    router.replace(`/admin/settings?tab=${tab}`)
  }

  const handleSaveScheduleOverride = async () => {
    if (!overrideFormDate.trim()) {
      setScheduleOverridesError("Укажите дату.")
      return
    }
    setScheduleOverridesError("")
    setSavingOverride(true)
    try {
      await adminApi.putScheduleOverride(overrideFormDate.trim(), {
        is_open: overrideFormOpen,
        ...(overrideFormOpen
          ? { open_time: overrideFormOpenTime, close_time: overrideFormCloseTime }
          : {}),
      })
      setScheduleOverrides(await adminApi.listScheduleOverrides())
    } catch (err) {
      setScheduleOverridesError(
        err instanceof Error ? err.message : "Не удалось сохранить исключение по дате"
      )
    } finally {
      setSavingOverride(false)
    }
  }

  const handleDeleteScheduleOverride = async (dateStr: string) => {
    setScheduleOverridesError("")
    try {
      await adminApi.deleteScheduleOverride(dateStr)
      setScheduleOverrides(await adminApi.listScheduleOverrides())
    } catch (err) {
      setScheduleOverridesError(
        err instanceof Error ? err.message : "Не удалось удалить исключение"
      )
    }
  }

  const userPublicBase = process.env.NEXT_PUBLIC_USER_API_URL || "/api/user"

  const handleMenuFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setMenuError("")
    setMenuUploading(true)
    try {
      await adminApi.uploadMenuPdf(file)
      const m = await adminApi.getMenuSettings()
      setMenuHas(m.hasMenu)
      setMenuPublicPath(m.menuUrl)
    } catch (err) {
      setMenuError(err instanceof Error ? err.message : "Не удалось загрузить меню")
    } finally {
      setMenuUploading(false)
      e.target.value = ""
    }
  }

  const handleDeleteMenu = async () => {
    setMenuError("")
    setMenuDeleting(true)
    try {
      await adminApi.deleteMenuPdf()
      setMenuHas(false)
      setMenuPublicPath(null)
    } catch (err) {
      setMenuError(err instanceof Error ? err.message : "Не удалось удалить меню")
    } finally {
      setMenuDeleting(false)
    }
  }

  const handleSavePublicFooter = async () => {
    setFooterSettingsError("")
    setSavingFooter(true)
    try {
      const r = await adminApi.patchPublicFooter({
        footerText: publicFooterText.trim() || null,
      })
      setPublicFooterText(r.footerText ?? "")
    } catch (err) {
      setFooterSettingsError(
        err instanceof Error ? err.message : "Не удалось сохранить строку копирайта"
      )
    } finally {
      setSavingFooter(false)
    }
  }

  const handleResetPublicFooter = async () => {
    setFooterSettingsError("")
    setSavingFooter(true)
    try {
      const r = await adminApi.patchPublicFooter({ footerText: null })
      setPublicFooterText(r.footerText ?? "")
    } catch (err) {
      setFooterSettingsError(
        err instanceof Error ? err.message : "Не удалось сбросить строку копирайта"
      )
    } finally {
      setSavingFooter(false)
    }
  }

  const handleSaveGuestContact = async () => {
    setGuestContactSettingsError("")
    setSavingGuestContact(true)
    try {
      const r = await adminApi.patchPublicGuestContact({
        address: guestContactAddress.trim() || null,
        phone: guestContactPhone.trim() || null,
        hours: guestContactHours.trim() || null,
      })
      setGuestContactAddress(r.address ?? "")
      setGuestContactPhone(r.phone ?? "")
      setGuestContactHours(r.hours ?? "")
    } catch (err) {
      setGuestContactSettingsError(
        err instanceof Error ? err.message : "Не удалось сохранить контакты для гостей"
      )
    } finally {
      setSavingGuestContact(false)
    }
  }

  const handleClearGuestContact = async () => {
    setGuestContactSettingsError("")
    setSavingGuestContact(true)
    try {
      const r = await adminApi.patchPublicGuestContact({
        address: null,
        phone: null,
        hours: null,
      })
      setGuestContactAddress(r.address ?? "")
      setGuestContactPhone(r.phone ?? "")
      setGuestContactHours(r.hours ?? "")
    } catch (err) {
      setGuestContactSettingsError(
        err instanceof Error ? err.message : "Не удалось очистить контакты"
      )
    } finally {
      setSavingGuestContact(false)
    }
  }

  const handleAddSetsInterval = async () => {
    if (!newSetsStart.trim() || !newSetsEnd.trim()) {
      setSetsIntervalsError("Укажите даты начала и конца периода.")
      return
    }
    setSetsIntervalsError("")
    setSavingSetsInterval(true)
    try {
      await adminApi.createSetsChoiceInterval({
        dateStart: newSetsStart.trim(),
        dateEnd: newSetsEnd.trim(),
      })
      setSetsChoiceIntervals(await adminApi.getSetsChoiceIntervals())
      setNewSetsStart("")
      setNewSetsEnd("")
    } catch (err) {
      setSetsIntervalsError(err instanceof Error ? err.message : "Не удалось добавить период")
    } finally {
      setSavingSetsInterval(false)
    }
  }

  const handleDeleteSetsInterval = async (id: number) => {
    setSetsIntervalsError("")
    try {
      await adminApi.deleteSetsChoiceInterval(id)
      setSetsChoiceIntervals(await adminApi.getSetsChoiceIntervals())
    } catch (err) {
      setSetsIntervalsError(err instanceof Error ? err.message : "Не удалось удалить период")
    }
  }

  const updateTableDraft = (tableId: number, patch: Partial<TableDraft>) => {
    setTableDrafts((prev) => ({
      ...prev,
      [tableId]: {
        ...prev[tableId],
        ...patch,
      },
    }))
  }

  const updateScheduleDraft = (weekday: number, patch: Partial<ScheduleDraft>) => {
    setScheduleDrafts((prev) => ({
      ...prev,
      [weekday]: {
        ...prev[weekday],
        ...patch,
      },
    }))
  }

  const resetNewTableForm = () => {
    setNewName("")
    setNewCapacity("2")
    setNewCanUnite(false)
    setNewUniteWithTableId("")
  }

  const handleAddTable = async () => {
    setTablesError("")
    setIsAddingTable(true)
    try {
      await adminApi.createTable({
        name: newName,
        capacity: parseInt(newCapacity, 10),
        is_active: true,
        can_unite: newCanUnite,
        unite_with_table_id: newCanUnite && newUniteWithTableId ? parseInt(newUniteWithTableId, 10) : null,
      })
      resetNewTableForm()
      await loadData()
    } catch (err) {
      setTablesError(err instanceof Error ? err.message : "Не удалось добавить стол")
    } finally {
      setIsAddingTable(false)
    }
  }

  const handleSaveTables = async () => {
    setTablesError("")
    setIsSavingTables(true)
    try {
      await Promise.all(
        tables.map((table) => {
          const draft = tableDrafts[table.id]
          if (!draft) return Promise.resolve()
          return adminApi.updateTable(table.id, {
            name: draft.name,
            capacity: parseInt(draft.maxCapacity, 10),
            is_active: draft.isActive,
            can_unite: draft.canUnite,
            unite_with_table_id: draft.canUnite && draft.uniteWithTableId ? parseInt(draft.uniteWithTableId, 10) : null,
          })
        })
      )
      await loadData()
    } catch (err) {
      setTablesError(err instanceof Error ? err.message : "Не удалось сохранить столы")
    } finally {
      setIsSavingTables(false)
    }
  }

  const handleDeleteTable = async (tableId: number) => {
    setTablesError("")
    try {
      await adminApi.deleteTable(tableId)
      await loadData()
    } catch (err) {
      setTablesError(err instanceof Error ? err.message : "Не удалось удалить стол")
    }
  }

  const handleSaveSchedule = async () => {
    setScheduleError("")
    setIsSavingSchedule(true)
    try {
      await Promise.all(
        schedule.map((day) => {
          const draft = scheduleDrafts[day.weekday]
          if (!draft) return Promise.resolve()
          return adminApi.updateScheduleDay(day.weekday, {
            is_open: draft.isOpen,
            open_time: draft.openTime,
            close_time: draft.closeTime,
          })
        })
      )
      await loadData()
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Не удалось сохранить график")
    } finally {
      setIsSavingSchedule(false)
    }
  }

  const handleAddRecipient = async () => {
    setTelegramError("")
    setIsSavingRecipient(true)
    try {
      await adminApi.createTelegramRecipient({
        chat_id: recipientChatId,
        label: recipientLabel || undefined,
      })
      setRecipientLabel("")
      setRecipientChatId("")
      await loadData()
    } catch (err) {
      setTelegramError(err instanceof Error ? err.message : "Не удалось добавить Telegram ID")
    } finally {
      setIsSavingRecipient(false)
    }
  }

  const handleDeleteRecipient = async (id: number) => {
    setTelegramError("")
    try {
      await adminApi.deleteTelegramRecipient(id)
      await loadData()
    } catch (err) {
      setTelegramError(err instanceof Error ? err.message : "Не удалось удалить Telegram ID")
    }
  }

  const saveButtonConfig =
    activeTab === "tables"
      ? {
          label: "Сохранить столы",
          onClick: () => void handleSaveTables(),
          disabled: isSavingTables,
        }
      : activeTab === "schedule"
        ? {
            label: "Сохранить график",
            onClick: () => void handleSaveSchedule(),
            disabled: isSavingSchedule,
          }
        : null

  const guestMenuHref =
    menuHas && menuPublicPath ? `${userPublicBase}${menuPublicPath}` : null

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon">
              <Link href="/admin">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">Настройки</h1>
              <p className="text-sm text-muted-foreground">
                Столы, график, даты, сеты, меню PDF и Telegram
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AdminLogoutButton />
            {saveButtonConfig ? (
              <Button onClick={saveButtonConfig.onClick} disabled={saveButtonConfig.disabled}>
                {saveButtonConfig.label}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl p-4 lg:p-6">
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Загрузка настроек...</div>
        ) : (
          <Tabs value={activeTab} onValueChange={setTab} className="gap-6">
            <TabsList>
              <TabsTrigger value="tables">
                <Armchair className="h-4 w-4" />
                Столы
              </TabsTrigger>
              <TabsTrigger value="schedule">
                <Clock3 className="h-4 w-4" />
                График
              </TabsTrigger>
              <TabsTrigger value="dates">
                <CalendarRange className="h-4 w-4" />
                Даты
              </TabsTrigger>
              <TabsTrigger value="sets">
                <UtensilsCrossed className="h-4 w-4" />
                Сеты
              </TabsTrigger>
              <TabsTrigger value="telegram">
                <Send className="h-4 w-4" />
                Telegram
              </TabsTrigger>
              <TabsTrigger value="menu">
                <FileText className="h-4 w-4" />
                Меню PDF
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tables" className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-4 text-sm font-medium">Добавить стол</div>
                <div className="grid gap-3 md:grid-cols-[minmax(200px,1fr)_140px_140px_minmax(180px,1fr)_140px]">
                  <div className="space-y-2">
                    <Label>Название</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Стол 9" />
                  </div>
                  <div className="space-y-2">
                    <Label>Вместимость</Label>
                    <Input type="number" min="1" value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Объединяемый</Label>
                    <div className="flex h-9 items-center">
                      <Switch
                        checked={newCanUnite}
                        onCheckedChange={(checked) => {
                          setNewCanUnite(checked)
                          if (!checked) setNewUniteWithTableId("")
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>С каким столом</Label>
                    <Select value={newUniteWithTableId || "none"} onValueChange={(value) => setNewUniteWithTableId(value === "none" ? "" : value)} disabled={!newCanUnite}>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите стол" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Не задано</SelectItem>
                        {tables.map((table) => (
                          <SelectItem key={table.id} value={String(table.id)}>
                            {table.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      className="w-full"
                      onClick={() => void handleAddTable()}
                      disabled={isAddingTable || !newName.trim() || !newCapacity.trim()}
                    >
                      Добавить
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {tables.map((table) => {
                  const draft = tableDrafts[table.id]
                  if (!draft) return null
                  return (
                    <div key={table.id} className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(160px,1fr)_140px_140px_minmax(180px,1fr)_120px]">
                      <div className="space-y-2">
                        <Label>Название</Label>
                        <Input value={draft.name} onChange={(e) => updateTableDraft(table.id, { name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Вместимость</Label>
                        <Input type="number" min="1" value={draft.maxCapacity} onChange={(e) => updateTableDraft(table.id, { maxCapacity: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Активен</Label>
                        <div className="flex h-9 items-center">
                          <Switch checked={draft.isActive} onCheckedChange={(checked) => updateTableDraft(table.id, { isActive: checked })} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Объединить с</Label>
                        <div className="space-y-2">
                          <div className="flex h-9 items-center">
                            <Switch checked={draft.canUnite} onCheckedChange={(checked) => updateTableDraft(table.id, { canUnite: checked, uniteWithTableId: checked ? draft.uniteWithTableId : "" })} />
                          </div>
                          <Select value={draft.uniteWithTableId || "none"} onValueChange={(value) => updateTableDraft(table.id, { uniteWithTableId: value === "none" ? "" : value })} disabled={!draft.canUnite}>
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите стол" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Не задано</SelectItem>
                              {tables.filter((candidate) => candidate.id !== table.id).map((candidate) => (
                                <SelectItem key={candidate.id} value={String(candidate.id)}>
                                  {candidate.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex items-end">
                        <Button variant="destructive" className="w-full" onClick={() => void handleDeleteTable(table.id)}>
                          Удалить
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {tablesError && <div className="text-sm text-destructive">{tablesError}</div>}
            </TabsContent>

            <TabsContent value="schedule" className="space-y-6">
              <div className="space-y-3">
                {schedule.map((day) => {
                  const draft = scheduleDrafts[day.weekday]
                  if (!draft) return null
                  return (
                    <div key={day.weekday} className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(180px,1fr)_120px_1fr_1fr]">
                      <div className="space-y-1">
                        <div className="font-medium">{dayLabels[day.dayName] || day.dayName}</div>
                        <div className="text-xs text-muted-foreground">{day.dayName}</div>
                      </div>
                      <div className="space-y-2">
                        <Label>Открыто</Label>
                        <div className="flex h-10 items-center">
                          <Switch checked={draft.isOpen} onCheckedChange={(checked) => updateScheduleDraft(day.weekday, { isOpen: checked })} />
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
                          onChange={(e) => updateScheduleDraft(day.weekday, { openTime: e.target.value })}
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
                          onChange={(e) => updateScheduleDraft(day.weekday, { closeTime: e.target.value })}
                          disabled={!draft.isOpen}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {scheduleError && <div className="text-sm text-destructive">{scheduleError}</div>}
            </TabsContent>

            <TabsContent value="dates" className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Для выбранной календарной даты можно задать своё расписание (время работы или «закрыто»). В этот день
                  недельный график не используется. Удалите исключение — снова действует обычный график по дню недели.
                </p>
                <div className="grid gap-4 md:grid-cols-[minmax(160px,1fr)_120px_1fr_1fr_auto] md:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="override-date">Дата</Label>
                    <Input
                      id="override-date"
                      type="date"
                      value={overrideFormDate}
                      onChange={(e) => setOverrideFormDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Открыто</Label>
                    <div className="flex h-10 items-center">
                      <Switch checked={overrideFormOpen} onCheckedChange={setOverrideFormOpen} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>С</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="12:00"
                      pattern={TIME_24H_PATTERN}
                      title="Формат времени: ЧЧ:ММ"
                      value={overrideFormOpenTime}
                      onChange={(e) => setOverrideFormOpenTime(e.target.value)}
                      disabled={!overrideFormOpen}
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
                      value={overrideFormCloseTime}
                      onChange={(e) => setOverrideFormCloseTime(e.target.value)}
                      disabled={!overrideFormOpen}
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full md:w-auto"
                    disabled={savingOverride}
                    onClick={() => void handleSaveScheduleOverride()}
                  >
                    {savingOverride ? "Сохранение…" : "Сохранить дату"}
                  </Button>
                </div>
                {scheduleOverridesError && (
                  <div className="text-sm text-destructive">{scheduleOverridesError}</div>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium">Заданные исключения</h3>
                {scheduleOverrides.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                    Пока нет исключений по датам (сейчас и на два года вперёд).
                  </div>
                ) : (
                  scheduleOverrides.map((row) => (
                    <div
                      key={row.date}
                      className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(200px,1fr)_1fr_auto]"
                    >
                      <div>
                        <div className="font-medium">
                          {format(parseISO(row.date), "d MMMM yyyy", { locale: ru })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(parseISO(row.date), "EEEE", { locale: ru })}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {row.isOpen ? (
                          <>
                            Открыто: {row.openTime ?? "—"} — {row.closeTime ?? "—"}
                          </>
                        ) : (
                          <>Закрыто весь день</>
                        )}
                      </div>
                      <div className="flex items-center">
                        <Button
                          type="button"
                          variant="destructive"
                          className="w-full md:w-auto"
                          onClick={() => void handleDeleteScheduleOverride(row.date)}
                        >
                          Удалить
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="sets" className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Укажите календарные периоды (включительно), когда гости на публичной странице бронирования могут выбрать
                  количество сетов. Вне этих дат поле сетов скрыто, в API передаётся «без сетов» (0). Можно задать
                  несколько непересекающихся или пересекающихся интервалов — достаточно попасть хотя бы в один.
                </p>
                <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="sets-start">Начало периода</Label>
                    <Input
                      id="sets-start"
                      type="date"
                      value={newSetsStart}
                      onChange={(e) => setNewSetsStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sets-end">Конец периода</Label>
                    <Input
                      id="sets-end"
                      type="date"
                      value={newSetsEnd}
                      onChange={(e) => setNewSetsEnd(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full md:w-auto"
                    disabled={savingSetsInterval}
                    onClick={() => void handleAddSetsInterval()}
                  >
                    {savingSetsInterval ? "Добавление…" : "Добавить период"}
                  </Button>
                </div>
                {setsIntervalsError && (
                  <div className="text-sm text-destructive">{setsIntervalsError}</div>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium">Текущие периоды</h3>
                {setsChoiceIntervals.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                    Периоды не заданы — гости не смогут выбирать сеты.
                  </div>
                ) : (
                  setsChoiceIntervals.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
                    >
                      <div className="text-sm">
                        <span className="font-medium">
                          {format(parseISO(row.dateStart), "d MMMM yyyy", { locale: ru })}
                        </span>
                        <span className="text-muted-foreground"> — </span>
                        <span className="font-medium">
                          {format(parseISO(row.dateEnd), "d MMMM yyyy", { locale: ru })}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => void handleDeleteSetsInterval(row.id)}
                      >
                        Удалить
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="telegram" className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-4 text-sm font-medium">Добавить получателя</div>
                <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)_120px]">
                  <div className="space-y-2">
                    <Label>Название</Label>
                    <Input value={recipientLabel} onChange={(e) => setRecipientLabel(e.target.value)} placeholder="Админ 1" />
                  </div>
                  <div className="space-y-2">
                    <Label>Telegram chat ID</Label>
                    <Input value={recipientChatId} onChange={(e) => setRecipientChatId(e.target.value)} placeholder="123456789" />
                  </div>
                  <div className="flex items-end">
                    <Button className="w-full" onClick={() => void handleAddRecipient()} disabled={isSavingRecipient}>
                      Добавить
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {recipients.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                    Telegram получатели пока не добавлены
                  </div>
                ) : (
                  recipients.map((recipient) => (
                    <div key={recipient.id} className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(160px,1fr)_minmax(220px,1fr)_120px]">
                      <div>
                        <div className="font-medium">{recipient.label || "Без названия"}</div>
                        <div className="text-xs text-muted-foreground">{recipient.isActive ? "Активен" : "Неактивен"}</div>
                      </div>
                      <div className="flex items-center text-sm text-muted-foreground">{recipient.chatId}</div>
                      <div className="flex items-center">
                        <Button variant="destructive" className="w-full" onClick={() => void handleDeleteRecipient(recipient.id)}>
                          Удалить
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {telegramError && <div className="text-sm text-destructive">{telegramError}</div>}
            </TabsContent>

            <TabsContent value="menu" className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Загрузите меню в формате PDF — на публичной странице бронирования появится ссылка «Меню ресторана».
                  Если файл не загружен, гости ссылки не увидят.
                </p>
                {menuHas && guestMenuHref ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      href={guestMenuHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary underline underline-offset-2"
                    >
                      Открыть меню (как у гостя)
                    </a>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={menuDeleting}
                      onClick={() => void handleDeleteMenu()}
                    >
                      {menuDeleting ? "Удаление…" : "Удалить меню"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Сейчас меню не загружено.</p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="menu-pdf">Загрузить или заменить PDF</Label>
                  <Input
                    id="menu-pdf"
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={menuUploading}
                    onChange={(ev) => void handleMenuFile(ev)}
                    className="cursor-pointer"
                  />
                  {menuUploading && (
                    <p className="text-xs text-muted-foreground">Загрузка…</p>
                  )}
                </div>
                {menuError && <div className="text-sm text-destructive">{menuError}</div>}
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                <div>
                  <p className="text-sm font-medium">Контакты на странице бронирования</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Блок с адресом, телефоном и режимом работы под формой. Показывается гостям только если
                    заполнено хотя бы одно поле. Пустые поля в блоке не отображаются.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guest-contact-address">Адрес</Label>
                  <Input
                    id="guest-contact-address"
                    value={guestContactAddress}
                    onChange={(e) => setGuestContactAddress(e.target.value)}
                    placeholder="ул. Примерная, 1"
                    maxLength={4000}
                    disabled={savingGuestContact}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guest-contact-phone">Телефон</Label>
                  <Input
                    id="guest-contact-phone"
                    value={guestContactPhone}
                    onChange={(e) => setGuestContactPhone(e.target.value)}
                    placeholder="+375 …"
                    maxLength={4000}
                    disabled={savingGuestContact}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guest-contact-hours">Режим работы</Label>
                  <Textarea
                    id="guest-contact-hours"
                    value={guestContactHours}
                    onChange={(e) => setGuestContactHours(e.target.value)}
                    placeholder={"пн–чт 12:00–22:00\nпт …"}
                    rows={5}
                    maxLength={4000}
                    disabled={savingGuestContact}
                    className="min-h-[100px] resize-y font-mono text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={savingGuestContact}
                    onClick={() => void handleSaveGuestContact()}
                  >
                    {savingGuestContact ? "Сохранение…" : "Сохранить контакты"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={savingGuestContact}
                    onClick={() => void handleClearGuestContact()}
                  >
                    Скрыть блок у гостей
                  </Button>
                </div>
                {guestContactSettingsError && (
                  <div className="text-sm text-destructive">{guestContactSettingsError}</div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                <div>
                  <p className="text-sm font-medium">Строка копирайта внизу страницы</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Мелкий текст под всей страницей бронирования. Можно несколько строк. Если оставить пустым
                    и сохранить — подставится стандартная строка © и год.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="public-footer">Текст копирайта</Label>
                  <Textarea
                    id="public-footer"
                    value={publicFooterText}
                    onChange={(e) => setPublicFooterText(e.target.value)}
                    placeholder={`© ${new Date().getFullYear()} Название. Все права защищены.`}
                    rows={4}
                    maxLength={4000}
                    disabled={savingFooter}
                    className="min-h-[100px] resize-y"
                  />
                  <p className="text-xs text-muted-foreground">
                    {publicFooterText.length}/4000 символов
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={savingFooter}
                    onClick={() => void handleSavePublicFooter()}
                  >
                    {savingFooter ? "Сохранение…" : "Сохранить копирайт"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={savingFooter}
                    onClick={() => void handleResetPublicFooter()}
                  >
                    Стандартный текст
                  </Button>
                </div>
                {footerSettingsError && (
                  <div className="text-sm text-destructive">{footerSettingsError}</div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  )
}
