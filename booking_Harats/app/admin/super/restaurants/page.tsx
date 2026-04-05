import { SuperRestaurantsClient } from "./super-restaurants-client"

export default function SuperRestaurantsPage() {
  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-lg">
        <SuperRestaurantsClient />
      </div>
    </div>
  )
}
