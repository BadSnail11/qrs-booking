import { AdminLoginForm } from "./page-client"

interface AdminLoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const resolved = (await searchParams) || {}
  const nextValue = resolved.next
  const nextPath =
    typeof nextValue === "string" && nextValue.startsWith("/") ? nextValue : "/admin"

  return <AdminLoginForm nextPath={nextPath} />
}
