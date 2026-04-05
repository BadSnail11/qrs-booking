-- Per-restaurant menu PDF (file on disk; path stored in DB)

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS menu_pdf_storage_name TEXT NULL;
