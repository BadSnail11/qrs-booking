import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getAdminSessionCookieName, verifyAdminSession } from "@/lib/admin-session"

const SECRET = process.env.ADMIN_SESSION_SECRET || "dev-admin-session-secret-change-me"

export async function GET() {
  const cookie = (await cookies()).get(getAdminSessionCookieName())?.value
  const session = cookie ? await verifyAdminSession(cookie, SECRET) : null
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.role === "superadmin") {
    return NextResponse.json({ role: "superadmin", displayName: "Superadmin", slug: null })
  }
  return NextResponse.json({
    role: "restaurant",
    displayName: session.displayName,
    slug: session.slug,
  })
}
