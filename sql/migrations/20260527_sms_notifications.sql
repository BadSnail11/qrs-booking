CREATE TABLE IF NOT EXISTS reservation_sms_notifications (
    id SERIAL PRIMARY KEY,
    reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    scheduled_for TIMESTAMP NULL,
    sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (reservation_id, event_type, scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_reservation_sms_notifications_event
    ON reservation_sms_notifications (event_type, sent_at);
