CREATE TABLE IF NOT EXISTS telegram_recipients (
    id SERIAL PRIMARY KEY,
    chat_id TEXT NOT NULL UNIQUE,
    label TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
