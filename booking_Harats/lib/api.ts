"use client"

const USER_API_URL = process.env.NEXT_PUBLIC_USER_API_URL || "/api/user"
const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || "/api/admin"

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  })

  const isJson = response.headers.get("content-type")?.includes("application/json")
  const payload = isJson ? await response.json() : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String(payload.error)
        : `Request failed with ${response.status}`
    throw new Error(message)
  }

  return payload as T
}

export const userApi = {
  getAvailability(date: string, guests: number) {
    return request<{
      date: string
      guests: number
      schedule: { weekday: number; dayName: string; isOpen: boolean; openTime: string | null; closeTime: string | null }
      slots: Array<{
        time: string
        available: boolean
        suggested_table_ids: number[]
        confirmation_mode?: "automatic" | "manual" | null
      }>
    }>(
      USER_API_URL,
      `/api/v1/availability?date=${encodeURIComponent(date)}&guests=${guests}`
    )
  },
  createReservation(body: Record<string, unknown>) {
    return request<{ message: string; reservation: Record<string, unknown> }>(USER_API_URL, "/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
}

export const adminApi = {
  getTelegramRecipients() {
    return request<Array<Record<string, unknown>>>(ADMIN_API_URL, "/api/v1/settings/telegram-recipients")
  },
  createTelegramRecipient(body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, "/api/v1/settings/telegram-recipients", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  deleteTelegramRecipient(id: number) {
    return request<{ message: string }>(ADMIN_API_URL, `/api/v1/settings/telegram-recipients/${id}`, {
      method: "DELETE",
    })
  },
  getSchedule() {
    return request<Array<Record<string, unknown>>>(ADMIN_API_URL, "/api/v1/settings/schedule")
  },
  updateScheduleDay(weekday: number, body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, `/api/v1/settings/schedule/${weekday}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  },
  getTables(date: string) {
    return request<Array<Record<string, unknown>>>(ADMIN_API_URL, `/api/v1/tables?date=${encodeURIComponent(date)}`)
  },
  createTable(body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, "/api/v1/tables", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  updateTable(id: number, body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, `/api/v1/tables/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  },
  deleteTable(id: number) {
    return request<Record<string, unknown>>(ADMIN_API_URL, `/api/v1/tables/${id}`, {
      method: "DELETE",
    })
  },
  getReservations(date: string, q?: string) {
    const search = new URLSearchParams({ date })
    if (q) search.set("q", q)
    return request<Array<Record<string, unknown>>>(ADMIN_API_URL, `/api/v1/reservations?${search.toString()}`)
  },
  createReservation(body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, "/api/v1/reservations", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  updateReservation(id: string, body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, `/api/v1/reservations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  },
  confirmReservation(id: string) {
    return request<{ message: string; reservation: Record<string, unknown> }>(
      ADMIN_API_URL,
      `/api/v1/reservations/${id}/confirm`,
      { method: "POST" }
    )
  },
  cancelReservation(id: string, reason?: string) {
    return request<{ message: string; reservation: Record<string, unknown> }>(
      ADMIN_API_URL,
      `/api/v1/reservations/${id}/cancel`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      }
    )
  },
  restoreReservation(id: string) {
    return request<{ message: string; reservation: Record<string, unknown> }>(
      ADMIN_API_URL,
      `/api/v1/reservations/${id}/restore`,
      { method: "POST" }
    )
  },
  deleteReservation(id: string) {
    return request<{ message: string }>(ADMIN_API_URL, `/api/v1/reservations/${id}`, {
      method: "DELETE",
    })
  },
  createTableBlock(body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, "/api/v1/table-blocks", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  checkTable(body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, "/api/v1/reservations/check-table", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  getAnalytics(params: URLSearchParams) {
    return request<Record<string, unknown>>(ADMIN_API_URL, `/api/v1/analytics/reservations?${params.toString()}`)
  },
}
