"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface AdminLoginFormProps {
  nextPath: string
}

export function AdminLoginForm({ nextPath }: AdminLoginFormProps) {
  const router = useRouter()
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    setIsSubmitting(true)

    try {
      const response = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password, next: nextPath }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(typeof payload?.error === "string" ? payload.error : "Не удалось войти")
        return
      }
      router.replace(typeof payload?.next === "string" ? payload.next : nextPath)
      router.refresh()
    } catch {
      setError("Не удалось войти")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Вход в админку</h1>
            <p className="text-sm text-muted-foreground">
              Логин — идентификатор ресторана (slug). Для суперадмина:{" "}
              <span className="font-medium text-foreground">superadmin</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-login">Логин</Label>
            <Input
              id="admin-login"
              type="text"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              placeholder="default или superadmin"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">Пароль</Label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Пароль"
              autoComplete="current-password"
            />
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Проверка..." : "Войти"}
          </Button>
        </form>
      </div>
    </div>
  )
}
