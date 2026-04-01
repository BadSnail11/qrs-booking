"use client"

import { useEffect, useState } from "react"
import { adminApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type TelegramRecipient = {
  id: number
  chatId: string
  label?: string
  isActive: boolean
}

interface ManageTelegramModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ManageTelegramModal({ isOpen, onClose }: ManageTelegramModalProps) {
  const [recipients, setRecipients] = useState<TelegramRecipient[]>([])
  const [chatId, setChatId] = useState("")
  const [label, setLabel] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const loadRecipients = async () => {
    setIsLoading(true)
    setSubmitError("")
    try {
      const data = await adminApi.getTelegramRecipients()
      setRecipients(data as TelegramRecipient[])
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось загрузить Telegram ID")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      void loadRecipients()
    }
  }, [isOpen])

  const handleAdd = async () => {
    setSubmitError("")
    try {
      await adminApi.createTelegramRecipient({
        chat_id: chatId,
        label: label || undefined,
      })
      setChatId("")
      setLabel("")
      await loadRecipients()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось добавить Telegram ID")
    }
  }

  const handleDelete = async (id: number) => {
    setSubmitError("")
    try {
      await adminApi.deleteTelegramRecipient(id)
      await loadRecipients()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось удалить Telegram ID")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Telegram уведомления</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="rounded-xl border border-border p-4">
            <div className="mb-4 text-sm font-medium">Добавить получателя</div>
            <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)_120px]">
              <div className="space-y-2">
                <Label>Название</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Админ 1" />
              </div>
              <div className="space-y-2">
                <Label>Telegram chat ID</Label>
                <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="123456789" />
              </div>
              <div className="flex items-end">
                <Button onClick={() => void handleAdd()} className="w-full">
                  Добавить
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Загрузка...</div>
            ) : recipients.length === 0 ? (
              <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
                Telegram получатели пока не добавлены
              </div>
            ) : (
              recipients.map((recipient) => (
                <div
                  key={recipient.id}
                  className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-[minmax(160px,1fr)_minmax(220px,1fr)_120px]"
                >
                  <div>
                    <div className="font-medium">{recipient.label || "Без названия"}</div>
                    <div className="text-xs text-muted-foreground">
                      {recipient.isActive ? "Активен" : "Неактивен"}
                    </div>
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">{recipient.chatId}</div>
                  <div className="flex items-center">
                    <Button variant="destructive" className="w-full" onClick={() => void handleDelete(recipient.id)}>
                      Удалить
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {submitError && <div className="text-sm text-destructive">{submitError}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
