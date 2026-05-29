-- Migrations to apply AFTER loading the production dump
-- Only adds missing tables/columns that the dump doesn't have

-- 20260418: floor plan
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS floor_plan_svg TEXT;

-- 20260419: floor plan shapes annotations
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS floor_plan_shapes JSONB NOT NULL DEFAULT '[]';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS floor_plan_annotations JSONB NOT NULL DEFAULT '[]';

-- 20260526: reservation arrival
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS arrival_status TEXT DEFAULT 'not_arrived';
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_reservations_arrival_status ON reservations(arrival_status);

-- 20260527: phone verification + visitors
CREATE TABLE IF NOT EXISTS phone_verification_challenges (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pvc_restaurant_phone ON phone_verification_challenges(restaurant_id, phone);

CREATE TABLE IF NOT EXISTS visitors (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    names_locked BOOLEAN NOT NULL DEFAULT FALSE,
    marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(restaurant_id, phone)
);

ALTER TABLE visitors ADD COLUMN IF NOT EXISTS reservation_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- 20260527: sms notifications
CREATE TABLE IF NOT EXISTS reservation_sms_notifications (
    id SERIAL PRIMARY KEY,
    reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    phone TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(reservation_id, kind)
);

-- 20260528: booking consents
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS offer_accepted_at TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS offer_document TEXT;

-- 20260528: iiko Cloud API integration
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS iiko_api_login TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS iiko_organization_id UUID;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS iiko_terminal_group_id UUID;

ALTER TABLE tables ADD COLUMN IF NOT EXISTS iiko_table_id UUID;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS iiko_section_id UUID;
CREATE INDEX IF NOT EXISTS idx_tables_iiko_table_id ON tables(iiko_table_id);

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS iiko_reserve_id UUID;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS iiko_customer_id UUID;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS iiko_creation_status TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 120;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_iiko_reserve_id ON reservations(iiko_reserve_id) WHERE iiko_reserve_id IS NOT NULL;

-- 20260529: iiko config + table mappings for Harat's
UPDATE restaurants SET
  iiko_api_login = '25732f210f244dde94262481532121ba',
  iiko_organization_id = '72a370a9-c6e4-48a1-9824-0e1e1dfa1318',
  iiko_terminal_group_id = '14e40e7c-5d86-cb20-0187-c173eabb0064'
WHERE id = 1;

UPDATE tables SET iiko_section_id = '42c4d7f5-dac2-4b76-9985-600396b804e0',
  iiko_table_id = CASE name
    WHEN 'T1'  THEN '76241c1f-de13-433c-b15d-550a830ff192'::uuid
    WHEN 'Т2'  THEN '9dd977b3-781c-4670-be4a-628ba0250d9d'::uuid
    WHEN 'Т3'  THEN '6cb7721a-43cd-49ca-bd7d-233e354fa1e6'::uuid
    WHEN 'Т4'  THEN 'e9c02d1b-8a3c-4004-bd00-c52afb7634d2'::uuid
    WHEN 'Т5'  THEN '4aa6b51a-fa25-4e82-b4ac-a0c6364c0eed'::uuid
    WHEN 'Т6'  THEN 'd601bab1-cdd3-4ab6-a1bb-e11354428c97'::uuid
    WHEN 'Т7'  THEN '12cc69aa-8b88-4bef-a1ef-793eeb33abba'::uuid
    WHEN 'Т8'  THEN '354c102b-ab8a-42d1-acab-75ea0a0fbe71'::uuid
    WHEN 'Т9'  THEN 'a1b6b681-89c7-41f7-9852-57021c69b298'::uuid
    WHEN 'Т10' THEN '64f4b72c-4ca1-4f78-85e8-316821222e74'::uuid
    WHEN 'Т11' THEN '31affb2a-8ff9-4305-bc8c-9140737ce42c'::uuid
    WHEN 'Т12' THEN 'c92cef51-50a3-4038-955d-a120b8a35b43'::uuid
    WHEN 'Т13' THEN '71bebf8d-c8ab-4f57-b05f-761918097098'::uuid
    WHEN 'Т14' THEN 'ceb211bd-8b7d-4e70-a892-fac7e52e4181'::uuid
    WHEN 'Т15' THEN '603197d7-823c-4fe1-aae7-71c73b072305'::uuid
    WHEN 'Т16' THEN '189ff401-7399-4047-9e45-d0d014e28eff'::uuid
    WHEN 'Т17' THEN '2b9f0642-a992-4b2a-8247-3090ca8d2e8f'::uuid
    WHEN 'Т18' THEN '665463df-8005-4b43-9948-f7ece2b2776f'::uuid
    WHEN 'Т20' THEN 'f7c4c2c2-a6f7-49d3-98ae-26a064ef1c18'::uuid
    WHEN 'Т21' THEN 'df7cd95b-ee58-447e-8170-9471371748dc'::uuid
  END
WHERE restaurant_id = 1 AND is_active = true;
