-- Table shape on floor plan; optional JSON annotations (rooms, exits, bar)

ALTER TABLE tables ADD COLUMN IF NOT EXISTS layout_shape TEXT NOT NULL DEFAULT 'rectangle';
ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_layout_shape_check;
ALTER TABLE tables ADD CONSTRAINT tables_layout_shape_check
  CHECK (layout_shape IN ('square', 'rectangle', 'circle', 'corner'));

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS floor_plan_annotations JSONB NULL DEFAULT '{}'::jsonb;

UPDATE tables SET layout_shape = 'rectangle' WHERE layout_shape IS NULL;
