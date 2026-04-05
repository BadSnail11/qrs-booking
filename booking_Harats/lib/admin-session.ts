const COOKIE_NAME = "qrs_admin_session"

const te = new TextEncoder()

function utf8ToB64Url(s: string): string {
  const bytes = te.encode(s)
  let bin = ""
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64UrlToUtf8(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export type AdminSessionPayload =
  | { role: "superadmin"; exp: number }
  | { role: "restaurant"; restaurantId: number; slug: string; displayName: string; exp: number }

export function getAdminSessionCookieName(): string {
  return COOKIE_NAME
}

export async function signAdminSession(
  payload: Omit<AdminSessionPayload, "exp">,
  secret: string,
  maxAgeSec = 60 * 60 * 24 * 7
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec
  const body = { ...payload, exp } as AdminSessionPayload
  const payloadStr = utf8ToB64Url(JSON.stringify(body))
  const key = await crypto.subtle.importKey(
    "raw",
    te.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, te.encode(payloadStr))
  let bin = ""
  new Uint8Array(sig).forEach((b) => (bin += String.fromCharCode(b)))
  const sigStr = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  return `${payloadStr}.${sigStr}`
}

export async function verifyAdminSession(
  cookie: string,
  secret: string
): Promise<AdminSessionPayload | null> {
  const dot = cookie.lastIndexOf(".")
  if (dot <= 0) return null
  const payloadStr = cookie.slice(0, dot)
  const sigStr = cookie.slice(dot + 1)
  if (!payloadStr || !sigStr) return null
  const key = await crypto.subtle.importKey(
    "raw",
    te.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  )
  const pad = sigStr.length % 4 === 0 ? "" : "=".repeat(4 - (sigStr.length % 4))
  const sigBytes = Uint8Array.from(atob(sigStr.replace(/-/g, "+").replace(/_/g, "/") + pad), (c) =>
    c.charCodeAt(0)
  )
  const ok = await crypto.subtle.verify("HMAC", key, sigBytes, te.encode(payloadStr))
  if (!ok) return null
  try {
    const body = JSON.parse(b64UrlToUtf8(payloadStr)) as AdminSessionPayload
    if (body.exp && Date.now() / 1000 > body.exp) return null
    return body
  } catch {
    return null
  }
}
