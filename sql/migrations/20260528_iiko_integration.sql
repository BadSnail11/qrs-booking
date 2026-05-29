-- iiko Cloud API integration: add iiko IDs and fields to existing tables

-- Restaurant: store iiko credentials and IDs
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS iiko_api_login TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS iiko_organization_id UUID;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS iiko_terminal_group_id UUID;

-- Tables: map local table IDs to iiko table UUIDs
ALTER TABLE tables ADD COLUMN IF NOT EXISTS iiko_table_id UUID;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS iiko_section_id UUID;
CREATE INDEX IF NOT EXISTS idx_tables_iiko_table_id ON tables(iiko_table_id);

-- Reservations: link to iiko reserve and track sync status
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS iiko_reserve_id UUID;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS iiko_customer_id UUID;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS iiko_creation_status TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 120;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_iiko_reserve_id ON reservations(iiko_reserve_id) WHERE iiko_reserve_id IS NOT NULL;
