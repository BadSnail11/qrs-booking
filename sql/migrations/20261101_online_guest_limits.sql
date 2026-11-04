-- Dates on which online bookings are capped at max_guests; larger parties must call.
-- Also created (and seeded once) lazily by booking_service._ensure_guest_limits_table.
CREATE TABLE IF NOT EXISTS online_guest_limits (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    limit_date DATE NOT NULL,
    max_guests INTEGER NOT NULL CHECK (max_guests > 0),
    UNIQUE (restaurant_id, limit_date)
);

INSERT INTO online_guest_limits (restaurant_id, limit_date, max_guests)
SELECT r.id, d::date, 6
FROM restaurants r
CROSS JOIN unnest(ARRAY['2026-12-18', '2026-12-19', '2026-12-26', '2026-12-29', '2026-12-30']) AS d
WHERE r.slug = 'harats'
ON CONFLICT (restaurant_id, limit_date) DO NOTHING;
