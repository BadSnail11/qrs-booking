"use client"

import { Badge } from "@/components/ui/badge"

export type ArrivalUiStatus = "awaiting" | "not_arrived" | "arrived" | "not_actual"

const labels: Record<ArrivalUiStatus, string> = {
  awaiting: "Ожидает",
  not_arrived: "Не пришёл",
  arrived: "Пришёл",
  not_actual: "Не актуально",
}

const variants: Record<ArrivalUiStatus, "default" | "secondary" | "destructive" | "outline"> = {
  awaiting: "secondary",
  not_arrived: "destructive",
  arrived: "default",
  not_actual: "outline",
}

export function ArrivalStatusBadge({ status }: { status: ArrivalUiStatus }) {
  const extra =
    status === "arrived"
      ? "bg-emerald-600 hover:bg-emerald-600 text-white"
      : status === "not_actual"
        ? "text-muted-foreground"
        : undefined
  return (
    <Badge variant={variants[status]} className={extra}>
      {labels[status]}
    </Badge>
  )
}
