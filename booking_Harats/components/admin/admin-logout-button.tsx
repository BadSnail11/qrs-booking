"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type AdminLogoutButtonProps = {
  variant?: "default" | "outline" | "ghost" | "secondary"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  /** Hide label on narrow layouts */
  compact?: boolean
}

export function AdminLogoutButton({
  variant = "outline",
  size = "sm",
  className,
  compact,
}: AdminLogoutButtonProps) {
  const router = useRouter()

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" })
    router.replace("/admin/login")
    router.refresh()
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("gap-2", className)}
      onClick={() => void logout()}
    >
      <LogOut className="h-4 w-4 shrink-0" />
      {!compact && <span>Выйти</span>}
    </Button>
  )
}
