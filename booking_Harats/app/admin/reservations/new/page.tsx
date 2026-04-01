import { AdminCreateReservationPageClient } from "./page-client"

export default async function AdminCreateReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>
}) {
  const params = await searchParams
  const view = params.view === "confirmed" ? "confirmed" : "queue"

  return (
    <AdminCreateReservationPageClient
      initialDate={params.date}
      initialView={view}
    />
  )
}
