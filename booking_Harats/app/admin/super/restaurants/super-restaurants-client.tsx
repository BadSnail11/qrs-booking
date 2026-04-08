"use client"

import { FormEvent, useEffect, useState } from "react"
import { Building2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { adminApi } from "@/lib/api"
import { AdminLogoutButton } from "@/components/admin/admin-logout-button"

type Row = {
  id: number
  slug: string
  displayName: string
  isActive: boolean
  hasMenu?: boolean
  hasCustomFooter?: boolean
}

export function SuperRestaurantsClient() {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState("")
  const [slug, setSlug] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow] = useState<Row | null>(null)
  const [editSlug, setEditSlug] = useState("")
  const [editDisplayName, setEditDisplayName] = useState("")
  const [editPassword, setEditPassword] = useState("")
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState("")

  const load = async () => {
    setError("")
    try {
      const data = (await adminApi.listSuperRestaurants()) as Row[]
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить список")
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const openEdit = (r: Row) => {
    setEditRow(r)
    setEditSlug(r.slug)
    setEditDisplayName(r.displayName)
    setEditPassword("")
    setEditError("")
    setEditOpen(true)
  }

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editRow) return
    setEditError("")
    setEditLoading(true)
    try {
      const body: Record<string, string> = {
        slug: editSlug.trim().toLowerCase(),
        displayName: editDisplayName.trim(),
      }
      if (editPassword.trim()) {
        body.password = editPassword
      }
      await adminApi.updateSuperRestaurant(editRow.id, body)
      setEditOpen(false)
      setEditRow(null)
      await load()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Не удалось сохранить")
    } finally {
      setEditLoading(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await adminApi.createSuperRestaurant({ slug, displayName, password })
      setSlug("")
      setDisplayName("")
      setPassword("")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Рестораны</h1>
            <p className="text-sm text-muted-foreground">
              Суперадмин: создание и редактирование заведений. Логин в админку ресторана — поле «Логин» (slug).
            </p>
          </div>
        </div>
        <AdminLogoutButton />
      </div>

      <div className="mb-8 rounded-xl border border-border bg-muted/30 p-4">
        <h2 className="mb-3 text-sm font-medium">Существующие</h2>
        <ul className="space-y-3 text-sm">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.displayName}</div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <code className="text-xs text-muted-foreground">{r.slug}</code>
                  {r.hasMenu ? (
                    <span className="text-xs text-muted-foreground">· меню PDF</span>
                  ) : null}
                  {r.hasCustomFooter ? (
                    <span className="text-xs text-muted-foreground">· подвал</span>
                  ) : null}
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => openEdit(r)}>
                <Pencil className="h-3.5 w-3.5" />
                Изменить
              </Button>
            </li>
          ))}
          {rows.length === 0 && <li className="text-muted-foreground">Пока нет записей</li>}
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 className="text-sm font-medium">Новый ресторан</h2>
        <div className="space-y-2">
          <Label htmlFor="slug">Логин (slug)</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="harats-minsk"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">Латиница, цифры и дефис; 2–63 символа.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dname">Название</Label>
          <Input
            id="dname"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Название для гостей"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw">Пароль админки</Label>
          <Input
            id="pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Не короче 6 символов"
            autoComplete="new-password"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Создание…" : "Создать ресторан"}
        </Button>
      </form>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>Редактировать ресторан</DialogTitle>
              <DialogDescription>
                Изменение логина (slug) не обновляет уже выданные сессии — сотрудникам нужно войти заново.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-slug">Логин (slug)</Label>
                <Input
                  id="edit-slug"
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value.toLowerCase())}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dname">Название</Label>
                <Input
                  id="edit-dname"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-pw">Новый пароль</Label>
                <Input
                  id="edit-pw"
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Оставьте пустым, чтобы не менять"
                  autoComplete="new-password"
                />
              </div>
              {editError && <p className="text-sm text-destructive">{editError}</p>}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={editLoading}>
                {editLoading ? "Сохранение…" : "Сохранить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
