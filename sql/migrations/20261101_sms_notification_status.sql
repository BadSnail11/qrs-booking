-- One SMS attempt per event: the row is written before sending and is never
-- retried; status records the outcome. Also added lazily by reservation_sms_service.
ALTER TABLE reservation_sms_notifications
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent',
    ADD COLUMN IF NOT EXISTS error TEXT;
