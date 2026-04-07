"use client"

const USER_API_URL = process.env.NEXT_PUBLIC_USER_API_URL || "/api/user"
const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || "/api/admin"

function userFriendlyHttpError(response: Response, payload: unknown): string {
  if (response.status >= 500) {
    return "Сервис временно недоступен. Попробуйте позже."
  }
  if (response.status === 401 || response.status === 403) {
    return "Доступ запрещён. Обновите страницу и попробуйте снова."
  }
  if (typeof payload === "object" && payload && "error" in payload) {
    return String((payload as { error: string }).error)
  }
  if (response.status === 404) {
    return "Запрашиваемые данные не найдены."
  }
  return "Не удалось выполнить запрос. Попробуйте позже."
}

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

async function userRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${USER_API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  })

  const isJson = response.headers.get("content-type")?.includes("application/json")
  const payload = isJson ? await response.json() : await response.text()

  if (!response.ok) {
    throw new Error(userFriendlyHttpError(response, payload))
  }

  return payload as T
}

export type PublicRestaurant = {
  slug: string
  displayName: string
  menuUrl: string | null
}

export const userApi = {
  listRestaurants() {
    return userRequest<PublicRestaurant[]>("/v1/restaurants")
  },
  getAvailability(date: string, guests: number, restaurantSlug: string) {
    const q = new URLSearchParams({
      date,
      guests: String(guests),
      restaurant: restaurantSlug,
    })
    return userRequest<{
      date: string
      guests: number
      schedule: { weekday: number; dayName: string; isOpen: boolean; openTime: string | null; closeTime: string | null }
      slots: Array<{
        time: string
        available: boolean
        suggested_table_ids: number[]
        confirmation_mode?: "automatic" | "manual" | null
      }>
    }>(`/v1/availability?${q.toString()}`)
  },
  createReservation(body: Record<string, unknown>) {
    return userRequest<{ message: string; reservation: Record<string, unknown> }>("/v1/reservations", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
}

export const adminApi = {
  getClientsDatabaseExport() {
    return `${ADMIN_API_URL}/v1/analytics/clients.xlsx`
  },
  getTelegramRecipients() {
    return request<Array<Record<string, unknown>>>(ADMIN_API_URL, "/v1/settings/telegram-recipients")
  },
  createTelegramRecipient(body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, "/v1/settings/telegram-recipients", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  deleteTelegramRecipient(id: number) {
    return request<{ message: string }>(ADMIN_API_URL, `/v1/settings/telegram-recipients/${id}`, {
      method: "DELETE",
    })
  },
  getMenuSettings() {
    return request<{ hasMenu: boolean; menuUrl: string | null }>(ADMIN_API_URL, "/v1/settings/menu")
  },
  uploadMenuPdf(file: File) {
    const fd = new FormData()
    fd.append("file", file)
    return fetch(`${ADMIN_API_URL}/v1/settings/menu`, {
      method: "POST",
      body: fd,
    }).then(async (res) => {
      const isJson = res.headers.get("content-type")?.includes("application/json")
      const payload = isJson ? await res.json() : await res.text()
      if (!res.ok) {
        const message =
          typeof payload === "object" && payload && "error" in payload
            ? String((payload as { error: string }).error)
            : `Request failed with ${res.status}`
        throw new Error(message)
      }
      return payload as { menuUrl: string; hasMenu: boolean }
    })
  },
  deleteMenuPdf() {
    return request<{ hasMenu: boolean }>(ADMIN_API_URL, "/v1/settings/menu", {
      method: "DELETE",
    })
  },
  getSchedule() {
    return request<Array<Record<string, unknown>>>(ADMIN_API_URL, "/v1/settings/schedule")
  },
  updateScheduleDay(weekday: number, body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, `/v1/settings/schedule/${weekday}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  },
  listScheduleOverrides(params?: { from?: string; to?: string }) {
    const q = new URLSearchParams()
    if (params?.from) q.set("from", params.from)
    if (params?.to) q.set("to", params.to)
    const qs = q.toString()
    return request<Array<{ date: string; isOpen: boolean; openTime: string | null; closeTime: string | null }>>(
      ADMIN_API_URL,
      `/v1/settings/schedule-overrides${qs ? `?${qs}` : ""}`
    )
  },
  putScheduleOverride(
    date: string,
    body: { is_open: boolean; open_time?: string; close_time?: string }
  ) {
    return request<{ date: string; isOpen: boolean; openTime: string | null; closeTime: string | null }>(
      ADMIN_API_URL,
      `/v1/settings/schedule-overrides/${encodeURIComponent(date)}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      }
    )
  },
  deleteScheduleOverride(date: string) {
    return request<{ message: string; date: string }>(
      ADMIN_API_URL,
      `/v1/settings/schedule-overrides/${encodeURIComponent(date)}`,
      { method: "DELETE" }
    )
  },
  getTables(date: string) {
    return request<Array<Record<string, unknown>>>(ADMIN_API_URL, `/v1/tables?date=${encodeURIComponent(date)}`)
  },
  createTable(body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, "/v1/tables", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  updateTable(id: number, body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, `/v1/tables/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  },
  deleteTable(id: number) {
    return request<Record<string, unknown>>(ADMIN_API_URL, `/v1/tables/${id}`, {
      method: "DELETE",
    })
  },
  getReservations(date?: string, q?: string) {
    const search = new URLSearchParams()
    if (date) search.set("date", date)
    if (q) search.set("q", q)
    const query = search.toString()
    return request<Array<Record<string, unknown>>>(ADMIN_API_URL, `/v1/reservations${query ? `?${query}` : ""}`)
  },
  createReservation(body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, "/v1/reservations", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  updateReservation(id: string, body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, `/v1/reservations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  },
  confirmReservation(id: string) {
    return request<{ message: string; reservation: Record<string, unknown> }>(
      ADMIN_API_URL,
      `/v1/reservations/${id}/confirm`,
      { method: "POST" }
    )
  },
  cancelReservation(id: string, reason?: string) {
    return request<{ message: string; reservation: Record<string, unknown> }>(
      ADMIN_API_URL,
      `/v1/reservations/${id}/cancel`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      }
    )
  },
  restoreReservation(id: string) {
    return request<{ message: string; reservation: Record<string, unknown> }>(
      ADMIN_API_URL,
      `/v1/reservations/${id}/restore`,
      { method: "POST" }
    )
  },
  deleteReservation(id: string) {
    return request<{ message: string }>(ADMIN_API_URL, `/v1/reservations/${id}`, {
      method: "DELETE",
    })
  },
  createTableBlock(body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, "/v1/table-blocks", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  checkTable(body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, "/v1/reservations/check-table", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  getAnalytics(params: URLSearchParams) {
    return request<Record<string, unknown>>(ADMIN_API_URL, `/v1/analytics/reservations?${params.toString()}`)
  },
  listSuperRestaurants() {
    return request<Array<Record<string, unknown>>>(ADMIN_API_URL, "/v1/super/restaurants")
  },
  createSuperRestaurant(body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, "/v1/super/restaurants", {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  updateSuperRestaurant(id: number, body: Record<string, unknown>) {
    return request<Record<string, unknown>>(ADMIN_API_URL, `/v1/super/restaurants/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  },
}
