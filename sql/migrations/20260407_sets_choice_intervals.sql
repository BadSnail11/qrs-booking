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
