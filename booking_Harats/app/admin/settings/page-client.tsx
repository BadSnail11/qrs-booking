"use client"

import { type ChangeEvent, useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { useRouter } from "next/navigation"
import { ArrowLeft, Armchair, Clock3, FileText, Send } from "lucide-react"
import { AdminLogoutButton } from "@/components/admin/admin-logout-button"
import type { ScheduleDay, Table } from "@/app/admin/page"
import { adminApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  initialTab: "tables" | "schedule" | "telegram" | "menu"
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

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  const loadData = async () => {
    setIsLoading(true)
    setError("")
    try {
      const [tablesData, scheduleData, recipientsData, menuData] = await Promise.all([
        adminApi.getTables(format(new Date(), "yyyy-MM-dd")),
        adminApi.getSchedule(),
        adminApi.getTelegramRecipients(),
        adminApi.getMenuSettings(),
      ])
      const nextTables = tablesData as Table[]
      const nextSchedule = scheduleData as ScheduleDay[]
      setTables(nextTables)
      setSchedule(nextSchedule)
      setRecipients(recipientsData as TelegramRecipient[])
      setMenuHas(Boolean(menuData.hasMenu))
      setMenuPublicPath(menuData.menuUrl)

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
    if (tab !== "tables" && tab !== "schedule" && tab !== "telegram" && tab !== "menu") return
    setActiveTab(tab)
    router.replace(`/admin/settings?tab=${tab}`)
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
              <p className="text-sm text-muted-foreground">Столы, график, меню PDF и Telegram</p>
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
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  )
}
