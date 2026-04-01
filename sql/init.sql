-- Physical tables in the restaurant (admin-configured).
CREATE TABLE IF NOT EXISTS tables (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    can_unite BOOLEAN NOT NULL DEFAULT FALSE,
    unite_with_table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
    CHECK (unite_with_table_id IS NULL OR unite_with_table_id <> id)
);

-- A booking (no direct table_id — tables are linked via reservation_tables).
CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL PRIMARY KEY,
    customer_name TEXT NOT NULL,
    reservation_time TIMESTAMP NOT NULL,
    guests INTEGER NOT NULL DEFAULT 1 CHECK (guests > 0),
    sets INTEGER NOT NULL DEFAULT 1 CHECK (sets > 0),
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
    weekday INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
    day_name TEXT NOT NULL,
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    CHECK (close_time > open_time)
);

INSERT INTO weekly_schedule (weekday, day_name, is_open, open_time, close_time)
VALUES
    (0, 'monday', TRUE, '16:00', '22:30'),
    (1, 'tuesday', TRUE, '16:00', '22:30'),
    (2, 'wednesday', TRUE, '16:00', '22:30'),
    (3, 'thursday', TRUE, '16:00', '22:30'),
    (4, 'friday', TRUE, '16:00', '23:30'),
    (5, 'saturday', TRUE, '14:00', '23:30'),
    (6, 'sunday', TRUE, '14:00', '22:30')
ON CONFLICT (weekday) DO NOTHING;

CREATE TABLE IF NOT EXISTS telegram_recipients (
    id SERIAL PRIMARY KEY,
    chat_id TEXT NOT NULL UNIQUE,
    label TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- INSERT INTO tables (name, capacity)
-- SELECT v.name, v.capacity
-- FROM (
--     VALUES
--         ('Table 1', 2),
--         ('Table 2', 4),

--         ('Table 3', 4),
--         ('Table 4', 6),
--         ('Table 5', 8)
-- ) AS v(name, capacity)
-- WHERE NOT EXISTS (SELECT 1 FROM tables);

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
