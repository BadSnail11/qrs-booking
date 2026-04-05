"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Building2 } from "lucide-react"
import { userApi, type PublicRestaurant } from "@/lib/api"

export function RestaurantPicker() {
  const router = useRouter()
  const [rows, setRows] = useState<PublicRestaurant[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void userApi
      .listRestaurants()
      .then((list) => {
        setRows(list)
        setError("")
      })
      .catch(() => {
        setError("Не удалось загрузить список ресторанов. Проверьте соединение и обновите страницу.")
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">Загрузка ресторанов…</p>
    )
  }

  if (error) {
    return <p className="text-center text-sm text-destructive">{error}</p>
  }

  if (rows.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Сейчас нет доступных ресторанов для бронирования.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.slug}>
          <button
            type="button"
            onClick={() => {
              router.push(`/?restaurant=${encodeURIComponent(r.slug)}`)
            }}
            className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all active:scale-[0.98] hover:border-primary/30"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{r.displayName}</p>
              <p className="text-sm text-muted-foreground">Забронировать столик</p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}
