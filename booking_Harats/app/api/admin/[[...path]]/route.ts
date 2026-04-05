import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getAdminSessionCookieName, verifyAdminSession } from "@/lib/admin-session"

const SECRET = process.env.ADMIN_SESSION_SECRET || "dev-admin-session-secret-change-me"

function adminOrigin(): string {
  return process.env.ADMIN_INTERNAL_URL || "http://127.0.0.1:8001"
}

function buildTargetUrl(req: NextRequest): string {
  const pathParts = req.nextUrl.pathname.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean)
  const suffix = pathParts.length ? `/${pathParts.join("/")}` : ""
  const search = req.nextUrl.search
  return `${adminOrigin()}/api${suffix}${search}`
}

async function proxy(req: NextRequest, method: string): Promise<NextResponse> {
  const target = buildTargetUrl(req)
  const headers = new Headers()
  const ct = req.headers.get("content-type")
  if (ct) headers.set("Content-Type", ct)

  const isAuthLogin = req.nextUrl.pathname.replace(/\/$/, "").endsWith("/v1/auth/login")
  if (!isAuthLogin) {
    const raw = req.cookies.get(getAdminSessionCookieName())?.value
    const session = raw ? await verifyAdminSession(raw, SECRET) : null
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.role === "superadmin") {
      headers.set("X-Superadmin", "1")
    } else if (session.role === "restaurant") {
      headers.set("X-Restaurant-Id", String(session.restaurantId))
    }
  }

  const hasBody = !["GET", "HEAD"].includes(method)
  const body = hasBody ? await req.arrayBuffer() : undefined

  const res = await fetch(target, {
    method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
    cache: "no-store",
  })

  const outHeaders = new Headers()
  const pass = ["content-type", "content-disposition"]
  for (const h of pass) {
    const v = res.headers.get(h)
    if (v) outHeaders.set(h, v)
  }

  return new NextResponse(res.body, { status: res.status, headers: outHeaders })
}

export async function GET(req: NextRequest) {
  return proxy(req, "GET")
}
export async function POST(req: NextRequest) {
  return proxy(req, "POST")
}
export async function PATCH(req: NextRequest) {
  return proxy(req, "PATCH")
}
export async function PUT(req: NextRequest) {
  return proxy(req, "PUT")
}
export async function DELETE(req: NextRequest) {
  return proxy(req, "DELETE")
}
