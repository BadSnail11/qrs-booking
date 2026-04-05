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
