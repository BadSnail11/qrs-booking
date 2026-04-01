import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

const ADMIN_AUTH_COOKIE = "qrs_admin_auth"

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next()
  }

  if (pathname === "/admin/login") {
    return NextResponse.next()
  }

  const isAuthed = request.cookies.get(ADMIN_AUTH_COOKIE)?.value === "ok"
  if (isAuthed) {
    return NextResponse.next()
  }

  const loginUrl = new URL("/admin/login", request.url)
  if (pathname !== "/admin") {
    loginUrl.searchParams.set("next", `${pathname}${search}`)
  } else if (search) {
    loginUrl.searchParams.set("next", `/admin${search}`)
  }
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/admin/:path*"],
}
