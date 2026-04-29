-- Track who completed a task and when
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_by text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
