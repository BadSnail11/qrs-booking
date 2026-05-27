"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { ArrowLeft, Search, Users } from "lucide-react"
import { AdminLogoutButton } from "@/components/admin/admin-logout-button"
import { adminApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type VisitorRow = {
  id: number
  phone: string
  firstName: string
  lastName: string
  firstSeenAt: string | null
  lastSeenAt: string | null
  reservationCount: number
}

function formatVisitorDate(value: string | null) {
  if (!value) return "—"
  try {
    return format(new Date(value), "d MMM yyyy, HH:mm", { locale: ru })
  } catch {
    return value
  }
}

export function AdminVisitorsPageClient() {
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [visitors, setVisitors] = useState<VisitorRow[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setError("")
    void adminApi
      .getVisitors(query || undefined)
      .then(setVisitors)
      .catch((err) => setError(err instanceof Error ? err.message : "Не удалось загрузить гостей"))
      .finally(() => setLoading(false))
  }, [query])

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" size="icon">
              <Link href="/admin">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-semibold">CRM гостей</h1>
              <p className="text-sm text-muted-foreground">
                Посетители с подтверждённым телефоном при онлайн-бронировании
              </p>
            </div>
          </div>
          <AdminLogoutButton />
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Поиск по имени или телефону"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setQuery(search.trim())
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setQuery(search.trim())}>
              Найти
            </Button>
            <Button asChild variant="outline">
              <a href={adminApi.getClientsDatabaseExport()} download>
                Excel
              </a>
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {loading ? "Загрузка…" : `Всего: ${visitors.length}`}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Имя</th>
                  <th className="px-4 py-3 font-medium">Телефон</th>
                  <th className="px-4 py-3 font-medium">Броней</th>
                  <th className="px-4 py-3 font-medium">Первый визит</th>
                  <th className="px-4 py-3 font-medium">Последний визит</th>
                </tr>
              </thead>
              <tbody>
                {!loading && visitors.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Гостей пока нет
                    </td>
                  </tr>
                ) : (
                  visitors.map((v) => (
                    <tr key={v.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">
                        {[v.firstName, v.lastName].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-4 py-3">{v.phone}</td>
                      <td className="px-4 py-3">{v.reservationCount}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatVisitorDate(v.firstSeenAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatVisitorDate(v.lastSeenAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
