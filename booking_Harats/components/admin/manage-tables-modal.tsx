"use client"

import { useEffect, useState } from "react"
import type { Table } from "@/app/admin/page"
import { adminApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

interface ManageTablesModalProps {
  isOpen: boolean
  onClose: () => void
  tables: Table[]
  onSaved: () => void
}

export function ManageTablesModal({
  isOpen,
  onClose,
  tables,
  onSaved,
}: ManageTablesModalProps) {
  const [newName, setNewName] = useState("")
  const [newCapacity, setNewCapacity] = useState("2")
  const [newCanUnite, setNewCanUnite] = useState(false)
  const [newUniteWithTableId, setNewUniteWithTableId] = useState<string>("")
  const [submitError, setSubmitError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [drafts, setDrafts] = useState<Record<number, { name: string; maxCapacity: string; isActive: boolean; canUnite: boolean; uniteWithTableId: string }>>({})

  useEffect(() => {
    const nextDrafts: Record<number, { name: string; maxCapacity: string; isActive: boolean; canUnite: boolean; uniteWithTableId: string }> = {}
    tables.forEach((table) => {
      nextDrafts[table.id] = {
        name: table.name,
        maxCapacity: String(table.maxCapacity),
        isActive: table.isActive ?? true,
        canUnite: table.canUnite ?? false,
        uniteWithTableId: table.uniteWithTableId ? String(table.uniteWithTableId) : "",
      }
    })
    setDrafts(nextDrafts)
  }, [tables, isOpen])

  const updateDraft = (tableId: number, patch: Partial<{ name: string; maxCapacity: string; isActive: boolean; canUnite: boolean; uniteWithTableId: string }>) => {
    setDrafts((prev) => ({
      ...prev,
      [tableId]: {
        ...prev[tableId],
        ...patch,
      },
    }))
  }

  const handleSaveAll = async () => {
    setSubmitError("")
    setIsSaving(true)
    try {
      if (newName.trim()) {
        await adminApi.createTable({
          name: newName,
          capacity: parseInt(newCapacity, 10),
          is_active: true,
          can_unite: newCanUnite,
          unite_with_table_id: newCanUnite && newUniteWithTableId ? parseInt(newUniteWithTableId, 10) : null,
        })
      }

      await Promise.all(
        tables.map((table) => {
          const draft = drafts[table.id]
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
      setNewName("")
      setNewCapacity("2")
      setNewCanUnite(false)
      setNewUniteWithTableId("")
      onSaved()
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось сохранить столы")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (tableId: number) => {
    setSubmitError("")
    try {
      await adminApi.deleteTable(tableId)
      onSaved()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось удалить стол")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Управление столами</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="rounded-xl border border-border p-4">
            <div className="mb-4 text-sm font-medium">Добавить стол</div>
            <div className="grid gap-3 md:grid-cols-[minmax(200px,1fr)_140px_140px_minmax(180px,1fr)]">
              <div className="space-y-2">
                <Label htmlFor="table-name">Название</Label>
                <Input id="table-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Стол 9" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="table-capacity">Вместимость</Label>
                <Input id="table-capacity" type="number" min="1" value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Объединяемый</Label>
                <div className="flex h-9 items-center">
                  <Switch checked={newCanUnite} onCheckedChange={(checked) => {
                    setNewCanUnite(checked)
                    if (!checked) setNewUniteWithTableId("")
                  }} />
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
            </div>
          </div>

          <div className="space-y-3">
            {tables.map((table) => {
              const draft = drafts[table.id]
              if (!draft) return null

              return (
                <div key={table.id} className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-[minmax(160px,1fr)_140px_140px_minmax(180px,1fr)_120px]">
                  <div className="space-y-2">
                    <Label>Название</Label>
                    <Input value={draft.name} onChange={(e) => updateDraft(table.id, { name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Вместимость</Label>
                    <Input type="number" min="1" value={draft.maxCapacity} onChange={(e) => updateDraft(table.id, { maxCapacity: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Активен</Label>
                    <div className="flex h-9 items-center">
                      <Switch checked={draft.isActive} onCheckedChange={(checked) => updateDraft(table.id, { isActive: checked })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Объединить с</Label>
                    <div className="space-y-2">
                      <div className="flex h-9 items-center">
                        <Switch checked={draft.canUnite} onCheckedChange={(checked) => updateDraft(table.id, { canUnite: checked, uniteWithTableId: checked ? draft.uniteWithTableId : "" })} />
                      </div>
                      <Select value={draft.uniteWithTableId || "none"} onValueChange={(value) => updateDraft(table.id, { uniteWithTableId: value === "none" ? "" : value })} disabled={!draft.canUnite}>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите стол" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Не задано</SelectItem>
                          {tables
                            .filter((candidate) => candidate.id !== table.id)
                            .map((candidate) => (
                              <SelectItem key={candidate.id} value={String(candidate.id)}>
                                {candidate.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-end">
                    <Button variant="destructive" onClick={() => void handleDelete(table.id)} className="w-full">
                      Удалить
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

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
