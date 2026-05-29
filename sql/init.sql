-- QRS Booking — full schema + seed data
-- This file is loaded on first run when the Postgres volume is empty.

-- ── Restaurants ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurants (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    menu_pdf_storage_name TEXT,
    public_guest_address TEXT,
    public_guest_phone TEXT,
    public_guest_hours TEXT,
    floor_plan_svg TEXT,
    floor_plan_shapes JSONB NOT NULL DEFAULT '[]',
    floor_plan_annotations JSONB NOT NULL DEFAULT '[]',
    iiko_api_login TEXT,
    iiko_organization_id UUID,
    iiko_terminal_group_id UUID
);

-- ── Tables ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tables (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    can_unite BOOLEAN NOT NULL DEFAULT FALSE,
    unite_with_table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
    iiko_table_id UUID,
    iiko_section_id UUID,
    CHECK (unite_with_table_id IS NULL OR unite_with_table_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_tables_restaurant_id ON tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_iiko_table_id ON tables(iiko_table_id);

-- ── Reservations ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
    customer_name TEXT NOT NULL,
    reservation_time TIMESTAMP NOT NULL,
    guests INTEGER NOT NULL DEFAULT 1 CHECK (guests > 0),
    sets INTEGER NOT NULL DEFAULT 1 CHECK (sets >= 0 AND sets <= 15),
    email TEXT,
    phone TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    arrival_status TEXT CHECK (arrival_status IS NULL OR arrival_status IN ('arrived', 'no_show')),
    arrived_at TIMESTAMPTZ,
    confirmation_code TEXT,
    created_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
    admin_note TEXT,
    cancelled_at TIMESTAMP,
    offer_accepted_at TIMESTAMPTZ,
    offer_document TEXT,
    iiko_reserve_id UUID,
    iiko_customer_id UUID,
    iiko_creation_status TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 120,
    cancel_reason TEXT,
    event_type TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_id ON reservations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_reservation_time ON reservations(reservation_time);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_arrival_status ON reservations(arrival_status);
CREATE INDEX IF NOT EXISTS idx_reservations_email ON reservations(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_iiko_reserve_id ON reservations(iiko_reserve_id) WHERE iiko_reserve_id IS NOT NULL;

-- ── Reservation ↔ Tables (many-to-many) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS reservation_tables (
    reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    PRIMARY KEY (reservation_id, table_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_tables_table_id ON reservation_tables(table_id);

-- ── Table blocks ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS table_blocks (
    id SERIAL PRIMARY KEY,
    table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_table_blocks_table_id ON table_blocks(table_id);
CREATE INDEX IF NOT EXISTS idx_table_blocks_time ON table_blocks(start_time, end_time);

-- ── Weekly schedule ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS weekly_schedule (
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    day_name TEXT NOT NULL,
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    PRIMARY KEY (restaurant_id, weekday),
    CHECK (close_time > open_time)
);

-- ── Schedule date overrides ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schedule_date_overrides (
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    override_date DATE NOT NULL,
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    open_time TIME,
    close_time TIME,
    PRIMARY KEY (restaurant_id, override_date),
    CHECK (is_open = FALSE OR (open_time IS NOT NULL AND close_time IS NOT NULL AND close_time > open_time))
);

CREATE INDEX IF NOT EXISTS idx_schedule_date_overrides_restaurant_date
    ON schedule_date_overrides(restaurant_id, override_date);

-- ── Sets choice intervals ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sets_choice_intervals (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    date_start DATE NOT NULL,
    date_end DATE NOT NULL,
    CHECK (date_end >= date_start)
);

CREATE INDEX IF NOT EXISTS idx_sets_choice_intervals_restaurant
    ON sets_choice_intervals(restaurant_id);

-- ── Telegram ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS telegram_recipients (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
    chat_id TEXT NOT NULL,
    label TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (restaurant_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_recipients_restaurant_id ON telegram_recipients(restaurant_id);

CREATE TABLE IF NOT EXISTS telegram_notifications (
    id SERIAL PRIMARY KEY,
    reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    message_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (reservation_id, chat_id, message_id)
);

-- ── Phone verification ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phone_verification_challenges (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pvc_restaurant_phone ON phone_verification_challenges(restaurant_id, phone);

-- ── Visitors ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS visitors (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    names_locked BOOLEAN NOT NULL DEFAULT FALSE,
    marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
    reservation_count INTEGER NOT NULL DEFAULT 0,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(restaurant_id, phone)
);

-- ── SMS notifications ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reservation_sms_notifications (
    id SERIAL PRIMARY KEY,
    reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    phone TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(reservation_id, kind)
);


-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════════════════

-- Harat's restaurant
INSERT INTO restaurants (id, slug, display_name, password_hash, is_active, public_guest_address, public_guest_phone, public_guest_hours)
VALUES (
    1, 'harats', 'Harat''s',
    'fb189086a928fa32d5d1bcfd3a63804e290623101cb6cb4c1bfd636136448145',
    TRUE,
    'ул. Карла Маркса, 24',
    '+375 44 762-55-46',
    E'пн-чт 12:00-2:00\nпт 12:00-4:00\nсб 14:00-4:00\nвс 14:00-2:00'
) ON CONFLICT (id) DO NOTHING;

-- Test restaurant
INSERT INTO restaurants (id, slug, display_name, password_hash, is_active)
VALUES (
    2, 'test', 'Test',
    'c10a7c1c5d9f5b39699866d4235b85cbb63552bfad3f615c869665feaa7f5746',
    TRUE
) ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('restaurants', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM restaurants), 1));

-- Harat's tables (with iiko mappings)
INSERT INTO tables (id, name, capacity, is_active, can_unite, unite_with_table_id, restaurant_id, iiko_table_id, iiko_section_id) VALUES
    (1,  'T1',  2, TRUE,  FALSE, NULL, 1, '76241c1f-de13-433c-b15d-550a830ff192', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (2,  'Т2',  2, TRUE,  FALSE, NULL, 1, '9dd977b3-781c-4670-be4a-628ba0250d9d', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (3,  'Т3',  4, TRUE,  TRUE,  4,    1, '6cb7721a-43cd-49ca-bd7d-233e354fa1e6', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (4,  'Т4',  4, TRUE,  TRUE,  3,    1, 'e9c02d1b-8a3c-4004-bd00-c52afb7634d2', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (5,  'Т5',  4, TRUE,  FALSE, NULL, 1, '4aa6b51a-fa25-4e82-b4ac-a0c6364c0eed', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (6,  'Т6',  4, TRUE,  FALSE, NULL, 1, 'd601bab1-cdd3-4ab6-a1bb-e11354428c97', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (7,  'Т7',  4, TRUE,  FALSE, NULL, 1, '12cc69aa-8b88-4bef-a1ef-793eeb33abba', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (8,  'Т8',  4, TRUE,  FALSE, NULL, 1, '354c102b-ab8a-42d1-acab-75ea0a0fbe71', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (9,  'Т9',  4, TRUE,  FALSE, NULL, 1, 'a1b6b681-89c7-41f7-9852-57021c69b298', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (10, 'Т10', 4, TRUE,  FALSE, NULL, 1, '64f4b72c-4ca1-4f78-85e8-316821222e74', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (11, 'Т11', 4, TRUE,  FALSE, NULL, 1, '31affb2a-8ff9-4305-bc8c-9140737ce42c', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (12, 'Т12', 4, TRUE,  FALSE, NULL, 1, 'c92cef51-50a3-4038-955d-a120b8a35b43', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (13, 'Т13', 4, TRUE,  FALSE, NULL, 1, '71bebf8d-c8ab-4f57-b05f-761918097098', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (14, 'Т14', 5, TRUE,  FALSE, NULL, 1, 'ceb211bd-8b7d-4e70-a892-fac7e52e4181', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (15, 'Т15', 4, TRUE,  FALSE, NULL, 1, '603197d7-823c-4fe1-aae7-71c73b072305', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (16, 'Т16', 6, TRUE,  FALSE, NULL, 1, '189ff401-7399-4047-9e45-d0d014e28eff', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (17, 'Т17', 6, TRUE,  FALSE, NULL, 1, '2b9f0642-a992-4b2a-8247-3090ca8d2e8f', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (18, 'Т18', 2, TRUE,  FALSE, NULL, 1, '665463df-8005-4b43-9948-f7ece2b2776f', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (19, 'Т20', 8, TRUE,  TRUE,  20,   1, 'f7c4c2c2-a6f7-49d3-98ae-26a064ef1c18', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (20, 'Т21', 4, TRUE,  TRUE,  19,   1, 'df7cd95b-ee58-447e-8170-9471371748dc', '42c4d7f5-dac2-4b76-9985-600396b804e0'),
    (21, 'Т30 VIP', 777, FALSE, TRUE, 22, 1, NULL, NULL),
    (22, 'Т31 VIP', 777, FALSE, TRUE, 21, 1, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Test restaurant tables
INSERT INTO tables (id, name, capacity, is_active, can_unite, unite_with_table_id, restaurant_id) VALUES
    (23, 'Т1', 2, TRUE, TRUE,  24,   2),
    (24, 'Т2', 4, TRUE, TRUE,  23,   2),
    (25, 'Т3', 8, TRUE, FALSE, NULL, 2),
    (26, 'Т4', 12, TRUE, FALSE, NULL, 2)
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('tables', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM tables), 1));

-- Weekly schedule — Harat's
INSERT INTO weekly_schedule (restaurant_id, weekday, day_name, is_open, open_time, close_time) VALUES
    (1, 0, 'monday',    TRUE, '16:00', '22:00'),
    (1, 1, 'tuesday',   TRUE, '16:00', '22:00'),
    (1, 2, 'wednesday', TRUE, '16:00', '22:00'),
    (1, 3, 'thursday',  TRUE, '16:00', '22:00'),
    (1, 4, 'friday',    TRUE, '16:00', '22:00'),
    (1, 5, 'saturday',  TRUE, '14:00', '22:00'),
    (1, 6, 'sunday',    TRUE, '14:00', '22:00')
ON CONFLICT (restaurant_id, weekday) DO NOTHING;

-- Weekly schedule — Test
INSERT INTO weekly_schedule (restaurant_id, weekday, day_name, is_open, open_time, close_time) VALUES
    (2, 0, 'monday',    TRUE, '16:00', '22:00'),
    (2, 1, 'tuesday',   TRUE, '16:00', '22:00'),
    (2, 2, 'wednesday', TRUE, '16:00', '22:00'),
    (2, 3, 'thursday',  TRUE, '16:00', '22:00'),
    (2, 4, 'friday',    TRUE, '16:00', '22:00'),
    (2, 5, 'saturday',  TRUE, '14:00', '22:00'),
    (2, 6, 'sunday',    TRUE, '14:00', '22:00')
ON CONFLICT (restaurant_id, weekday) DO NOTHING;

-- Telegram recipients
INSERT INTO telegram_recipients (id, chat_id, label, is_active, restaurant_id) VALUES
    (1, '882049430',  'test',      TRUE, 1),
    (2, '851557417',  'test2',     TRUE, 1),
    (3, '1399605391', 'Аселия',    TRUE, 1),
    (4, '1661995720', 'Александр', TRUE, 1),
    (6, '851557417',  'Ivan',      TRUE, 2),
    (7, '368448379',  'Polina',    TRUE, 2)
ON CONFLICT (restaurant_id, chat_id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('telegram_recipients', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM telegram_recipients), 1));
