-- Tenant (restaurant). Login slug + password for admin panel (see RESTAURANT_PASSWORD_SALT).
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

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS menu_pdf_storage_name TEXT NULL;

SELECT setval(
    pg_get_serial_sequence('restaurants', 'id'),
    GREATEST((SELECT COALESCE(MAX(id), 1) FROM restaurants), 1)
);

-- Physical tables in the restaurant (admin-configured).
CREATE TABLE IF NOT EXISTS tables (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    can_unite BOOLEAN NOT NULL DEFAULT FALSE,
    unite_with_table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
    CHECK (unite_with_table_id IS NULL OR unite_with_table_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_tables_restaurant_id ON tables (restaurant_id);

-- A booking (no direct table_id — tables are linked via reservation_tables).
CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    reservation_time TIMESTAMP NOT NULL,
    guests INTEGER NOT NULL DEFAULT 1 CHECK (guests > 0),
    sets INTEGER NOT NULL DEFAULT 1 CHECK (sets >= 0 AND sets <= 15),
    email TEXT,
    phone TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    confirmation_code TEXT,
    created_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
    admin_note TEXT,
    cancelled_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_id ON reservations (restaurant_id);

-- Many-to-many: one reservation can use several tables; a table appears on many reservations over time.
CREATE TABLE IF NOT EXISTS reservation_tables (
    reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    PRIMARY KEY (reservation_id, table_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_tables_table_id ON reservation_tables(table_id);
CREATE INDEX IF NOT EXISTS idx_reservations_reservation_time ON reservations(reservation_time);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_email ON reservations(email);

-- Table-level maintenance/service block windows.
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

INSERT INTO weekly_schedule (restaurant_id, weekday, day_name, is_open, open_time, close_time)
VALUES
    (1, 0, 'monday', TRUE, '16:00', '22:30'),
    (1, 1, 'tuesday', TRUE, '16:00', '22:30'),
    (1, 2, 'wednesday', TRUE, '16:00', '22:30'),
    (1, 3, 'thursday', TRUE, '16:00', '22:30'),
    (1, 4, 'friday', TRUE, '16:00', '23:30'),
    (1, 5, 'saturday', TRUE, '14:00', '23:30'),
    (1, 6, 'sunday', TRUE, '14:00', '22:30')
ON CONFLICT (restaurant_id, weekday) DO NOTHING;

CREATE TABLE IF NOT EXISTS telegram_recipients (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    label TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (restaurant_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_recipients_restaurant_id ON telegram_recipients (restaurant_id);

CREATE TABLE IF NOT EXISTS telegram_notifications (
    id SERIAL PRIMARY KEY,
    reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    message_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (reservation_id, chat_id, message_id)
);

-- Legacy idempotent column adds (no-op on fresh schema above)
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS guests INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS sets INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS confirmation_code TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS created_by_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE tables ADD COLUMN IF NOT EXISTS can_unite BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS unite_with_table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL;
