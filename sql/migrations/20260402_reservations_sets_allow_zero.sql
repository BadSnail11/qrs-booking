-- Allow sets = 0 («Без сетов»). Run once on existing databases created before this change.
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_sets_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_sets_check CHECK (sets >= 0 AND sets <= 15);
