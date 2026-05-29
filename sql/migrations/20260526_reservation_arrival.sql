-- Track guest arrival for confirmed reservations; auto no-show after slot ends.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS arrival_status TEXT
    CHECK (arrival_status IS NULL OR arrival_status IN ('arrived', 'no_show'));
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_reservations_arrival_status ON reservations (arrival_status);
