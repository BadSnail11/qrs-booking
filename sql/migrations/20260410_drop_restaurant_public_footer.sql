-- Remove per-restaurant copyright line; guest page uses a fixed default only.

ALTER TABLE restaurants DROP COLUMN IF EXISTS public_footer_text;
