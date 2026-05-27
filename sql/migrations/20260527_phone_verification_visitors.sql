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
