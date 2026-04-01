import { NextResponse } from "next/server"

const ADMIN_AUTH_COOKIE = "qrs_admin_auth"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const password = String(body?.password || "")
  const next = typeof body?.next === "string" && body.next.startsWith("/") ? body.next : "/admin"
  const expectedPassword = process.env.ADMIN_PASSWORD || "admin123"

  if (!password || password !== expectedPassword) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true, next })
  response.cookies.set(ADMIN_AUTH_COOKIE, "ok", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })
  return response
}
