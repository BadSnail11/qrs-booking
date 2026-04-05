// v3: force turbopack rebuild - timestamp 1711558800
import { Suspense } from "react"
import { HomeContent } from "./home-content"

export default function BookingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background px-5 text-sm text-muted-foreground">
          Загрузка…
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  )
}
