import { AdminEditReservationPageClient } from "./page-client"

export default async function AdminEditReservationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: string; view?: string }>
}) {
  const routeParams = await params
  const query = await searchParams

  return (
    <AdminEditReservationPageClient
      reservationId={routeParams.id}
      initialDate={query.date}
      initialView={query.view === "confirmed" ? "confirmed" : "queue"}
    />
  )
}
