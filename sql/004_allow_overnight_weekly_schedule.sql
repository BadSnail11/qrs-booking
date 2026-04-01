DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT c.conname
    INTO constraint_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = 'weekly_schedule'
      AND n.nspname = current_schema()
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%close_time%'
      AND pg_get_constraintdef(c.oid) ILIKE '%open_time%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE weekly_schedule DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

ALTER TABLE weekly_schedule
ADD CONSTRAINT weekly_schedule_open_close_not_equal
CHECK (close_time <> open_time);
