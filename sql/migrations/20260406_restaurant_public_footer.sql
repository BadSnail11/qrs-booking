-- Custom footer text on public booking page (per restaurant)

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS public_footer_text TEXT NULL;
