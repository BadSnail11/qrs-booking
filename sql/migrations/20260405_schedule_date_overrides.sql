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
