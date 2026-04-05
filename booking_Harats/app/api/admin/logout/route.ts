import { NextResponse } from "next/server"
import { getAdminSessionCookieName } from "@/lib/admin-session"

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(getAdminSessionCookieName(), "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  })
  return res
}
