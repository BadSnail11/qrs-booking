-- Outcome of every iiko reserve/create call. iiko auto-blocks the apiLogin when
-- more than 20% of these return HTTP 400 within 24h; the integration reads this
-- table to pause sending before that threshold. Also created lazily by iiko_service.
CREATE TABLE IF NOT EXISTS iiko_request_log (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    path TEXT NOT NULL,
    status_code INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_iiko_request_log_path_created
    ON iiko_request_log (path, created_at);
