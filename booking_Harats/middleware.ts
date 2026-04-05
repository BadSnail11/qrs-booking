import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getAdminSessionCookieName, verifyAdminSession } from "@/lib/admin-session"

const SECRET = process.env.ADMIN_SESSION_SECRET || "dev-admin-session-secret-change-me"

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next()
  }

  if (pathname === "/admin/login") {
    return NextResponse.next()
  }

  const raw = request.cookies.get(getAdminSessionCookieName())?.value
  const session = raw ? await verifyAdminSession(raw, SECRET) : null
  if (!session) {
    const loginUrl = new URL("/admin/login", request.url)
    if (pathname !== "/admin") {
      loginUrl.searchParams.set("next", `${pathname}${search}`)
    } else if (search) {
      loginUrl.searchParams.set("next", `/admin${search}`)
    }
    return NextResponse.redirect(loginUrl)
  }

  if (session.role === "restaurant" && pathname.startsWith("/admin/super")) {
    return NextResponse.redirect(new URL("/admin", request.url))
  }

  if (session.role === "superadmin" && !pathname.startsWith("/admin/super")) {
    return NextResponse.redirect(new URL("/admin/super/restaurants", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}
