import { NextResponse } from "next/server"
import { getAdminSessionCookieName, signAdminSession } from "@/lib/admin-session"

const SECRET = process.env.ADMIN_SESSION_SECRET || "dev-admin-session-secret-change-me"

function adminOrigin(): string {
  return process.env.ADMIN_INTERNAL_URL || "http://127.0.0.1:8001"
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const login = String(body?.login || body?.restaurant || "").trim().toLowerCase()
  const password = String(body?.password || "")
  const next = typeof body?.next === "string" && body.next.startsWith("/") ? body.next : "/admin"

  if (!login || !password) {
    return NextResponse.json({ error: "Введите логин ресторана и пароль" }, { status: 400 })
  }

  const res = await fetch(`${adminOrigin()}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password }),
    cache: "no-store",
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    return NextResponse.json(
      { error: typeof payload?.error === "string" ? payload.error : "Неверный логин или пароль" },
      { status: 401 }
    )
  }

  const role = payload.role as string
  let token: string
  if (role === "superadmin") {
    token = await signAdminSession({ role: "superadmin" }, SECRET)
  } else {
    token = await signAdminSession(
      {
        role: "restaurant",
        restaurantId: Number(payload.restaurantId),
        slug: String(payload.slug || ""),
        displayName: String(payload.displayName || ""),
      },
      SECRET
    )
  }

  const response = NextResponse.json({
    ok: true,
    next: role === "superadmin" ? "/admin/super/restaurants" : next,
    role,
  })
  response.cookies.set(getAdminSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })
  return response
}
