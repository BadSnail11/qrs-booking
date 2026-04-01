"use client"

import type { Booking } from "@/app/admin/page"
import { Badge } from "@/components/ui/badge"

interface ReservationStatusBadgeProps {
  status: Booking["status"]
}

const labels: Record<Booking["status"], string> = {
  confirmed: "Подтверждена",
  pending: "Ожидает",
  cancelled: "Отменена",
}

const variants: Record<Booking["status"], "default" | "secondary" | "destructive"> = {
  confirmed: "default",
  pending: "secondary",
  cancelled: "destructive",
}

export function ReservationStatusBadge({ status }: ReservationStatusBadgeProps) {
  return <Badge variant={variants[status]}>{labels[status]}</Badge>
}
