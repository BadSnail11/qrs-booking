-- Allow sets = 0 («Без сетов»). Run once on existing databases created before this change.
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_sets_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_sets_check CHECK (sets >= 0 AND sets <= 15);
-- Multi-restaurant: restaurants row + restaurant_id on core tables.
-- Default login slug: default  /  password: admin123  (RESTAURANT_PASSWORD_SALT=change-me-in-production)

CREATE TABLE IF NOT EXISTS restaurants (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO restaurants (id, slug, display_name, password_hash)
VALUES (
    1,
    'default',
    'Ресторан',
    'fb189086a928fa32d5d1bcfd3a63804e290623101cb6cb4c1bfd636136448145'
)
ON CONFLICT (id) DO NOTHING;

SELECT setval(
    pg_get_serial_sequence('restaurants', 'id'),
    GREATEST((SELECT COALESCE(MAX(id), 1) FROM restaurants), 1)
);

ALTER TABLE tables ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
UPDATE tables SET restaurant_id = 1 WHERE restaurant_id IS NULL;
ALTER TABLE tables ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
UPDATE reservations SET restaurant_id = 1 WHERE restaurant_id IS NULL;
ALTER TABLE reservations ALTER COLUMN restaurant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tables_restaurant_id ON tables (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_id ON reservations (restaurant_id);

-- weekly_schedule: composite PK (restaurant_id, weekday)
CREATE TABLE IF NOT EXISTS weekly_schedule_migrate (
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    day_name TEXT NOT NULL,
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    PRIMARY KEY (restaurant_id, weekday),
    CHECK (close_time > open_time)
);

INSERT INTO weekly_schedule_migrate (restaurant_id, weekday, day_name, is_open, open_time, close_time)
SELECT 1, weekday, day_name, is_open, open_time, close_time FROM weekly_schedule;

DROP TABLE IF EXISTS weekly_schedule;
ALTER TABLE weekly_schedule_migrate RENAME TO weekly_schedule;

ALTER TABLE telegram_recipients ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);
UPDATE telegram_recipients SET restaurant_id = 1 WHERE restaurant_id IS NULL;
ALTER TABLE telegram_recipients ALTER COLUMN restaurant_id SET NOT NULL;

ALTER TABLE telegram_recipients DROP CONSTRAINT IF EXISTS telegram_recipients_chat_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS telegram_recipients_restaurant_chat
    ON telegram_recipients (restaurant_id, chat_id);

CREATE INDEX IF NOT EXISTS idx_telegram_recipients_restaurant_id ON telegram_recipients (restaurant_id);
-- Per-restaurant menu PDF (file on disk; path stored in DB)

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS menu_pdf_storage_name TEXT NULL;
-- Per-date schedule overrides (replace weekly template for that calendar day).

CREATE TABLE IF NOT EXISTS schedule_date_overrides (
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    override_date DATE NOT NULL,
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    open_time TIME,
    close_time TIME,
    PRIMARY KEY (restaurant_id, override_date),
    CHECK (
        is_open = FALSE
        OR (
            open_time IS NOT NULL
            AND close_time IS NOT NULL
            AND close_time > open_time
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_schedule_date_overrides_restaurant_date
    ON schedule_date_overrides (restaurant_id, override_date);
-- Custom footer text on public booking page (per restaurant)

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS public_footer_text TEXT NULL;
-- Calendar intervals when guests may choose number of sets (per restaurant).

CREATE TABLE IF NOT EXISTS sets_choice_intervals (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    date_start DATE NOT NULL,
    date_end DATE NOT NULL,
    CHECK (date_end >= date_start)
);

CREATE INDEX IF NOT EXISTS idx_sets_choice_intervals_restaurant
    ON sets_choice_intervals (restaurant_id);

-- Preserve previous hardcoded window for default tenant (restaurant id 1).
INSERT INTO sets_choice_intervals (restaurant_id, date_start, date_end)
SELECT 1, '2026-04-09', '2026-04-26'
WHERE EXISTS (SELECT 1 FROM restaurants WHERE id = 1)
  AND NOT EXISTS (
    SELECT 1 FROM sets_choice_intervals
    WHERE restaurant_id = 1 AND date_start = '2026-04-09' AND date_end = '2026-04-26'
  );
-- Guest-facing contact block (address, phone, hours) on public booking page

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS public_guest_address TEXT NULL;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS public_guest_phone TEXT NULL;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS public_guest_hours TEXT NULL;

-- Backfill default tenant with previous hardcoded UI (only if all three still empty)
UPDATE restaurants
SET
    public_guest_address = 'ул. Карла Маркса, 24',
    public_guest_phone = '+375 44 762-55-46',
    public_guest_hours = E'пн-чт 12:00-2:00\nпт 12:00-4:00\nсб 14:00-4:00\nвс 14:00-2:00'
WHERE id = 1
  AND (public_guest_address IS NULL OR TRIM(public_guest_address) = '')
  AND (public_guest_phone IS NULL OR TRIM(public_guest_phone) = '')
  AND (public_guest_hours IS NULL OR TRIM(public_guest_hours) = '');
-- Remove per-restaurant copyright line; guest page uses a fixed default only.

ALTER TABLE restaurants DROP COLUMN IF EXISTS public_footer_text;
-- Admin floor plan: hall dimensions + per-table layout (normalized 0..1 coordinates)

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS floor_plan_width INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS floor_plan_height INTEGER NOT NULL DEFAULT 700;

ALTER TABLE tables ADD COLUMN IF NOT EXISTS layout_x DOUBLE PRECISION NULL;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS layout_y DOUBLE PRECISION NULL;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS layout_w DOUBLE PRECISION NULL;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS layout_h DOUBLE PRECISION NULL;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS layout_rotation DOUBLE PRECISION NULL;
-- Table shape on floor plan; optional JSON annotations (rooms, exits, bar)

ALTER TABLE tables ADD COLUMN IF NOT EXISTS layout_shape TEXT NOT NULL DEFAULT 'rectangle';
ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_layout_shape_check;
ALTER TABLE tables ADD CONSTRAINT tables_layout_shape_check
  CHECK (layout_shape IN ('square', 'rectangle', 'circle', 'corner'));

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS floor_plan_annotations JSONB NULL DEFAULT '{}'::jsonb;

UPDATE tables SET layout_shape = 'rectangle' WHERE layout_shape IS NULL;
-- Track guest arrival for confirmed reservations; auto no-show after slot ends.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS arrival_status TEXT
    CHECK (arrival_status IS NULL OR arrival_status IN ('arrived', 'no_show'));
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_reservations_arrival_status ON reservations (arrival_status);
-- Phone SMS verification challenges and visitor CRM

CREATE TABLE IF NOT EXISTS phone_verification_challenges (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    phone_normalized TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    verified_token TEXT UNIQUE,
    verified_expires_at TIMESTAMP,
    verified_at TIMESTAMP,
    consumed_at TIMESTAMP,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_verification_lookup
    ON phone_verification_challenges (restaurant_id, phone_normalized, created_at DESC);

CREATE TABLE IF NOT EXISTS visitors (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    reservation_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE (restaurant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_visitors_restaurant ON visitors (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_visitors_phone ON visitors (restaurant_id, phone);
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
ALTER TABLE reservations
    ADD COLUMN IF NOT EXISTS offer_accepted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS offer_document TEXT;

ALTER TABLE visitors
    ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMP;
