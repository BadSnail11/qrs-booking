-- Guest-facing contact block (address, phone, hours) on public booking page

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS public_guest_address TEXT NULL;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS public_guest_phone TEXT NULL;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS public_guest_hours TEXT NULL;

-- Backfill default tenant with previous hardcoded UI (only if all three still empty)
UPDATE restaurants
SET
    public_guest_address = 'ул. Карла Маркса, 24',
    public_guest_phone = '+375 44 762-55-46',
    public_guest_hours = E'пн-чт 12:00-2:00\nпт 12:00-4:00\nсб 14:00-4:00\nвс 14:00-2:00'
WHERE id = 1
  AND (public_guest_address IS NULL OR TRIM(public_guest_address) = '')
  AND (public_guest_phone IS NULL OR TRIM(public_guest_phone) = '')
  AND (public_guest_hours IS NULL OR TRIM(public_guest_hours) = '');
