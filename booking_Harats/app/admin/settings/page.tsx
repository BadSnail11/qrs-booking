import { AdminSettingsPageClient } from "./page-client"

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const params = await searchParams
  const tab =
    params.tab === "schedule" || params.tab === "telegram" || params.tab === "menu"
      ? params.tab
      : "tables"

  return <AdminSettingsPageClient initialTab={tab} />
}
