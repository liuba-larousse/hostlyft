-- Weekly schedules: weeks table + extend tasks table
-- Run this in Supabase SQL Editor

-- 1. Create weeks table
CREATE TABLE IF NOT EXISTS weeks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start  date NOT NULL UNIQUE,
  week_label  text,
  invoices    jsonb DEFAULT '[]'::jsonb,
  carry_over  jsonb DEFAULT '[]'::jsonb,
  person_hours jsonb DEFAULT '{}'::jsonb,
  created_by  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- 2. Extend tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS week_id      uuid REFERENCES weeks(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS day_of_week  text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type    text DEFAULT 'client';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dependency   text DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delegate     text DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order   integer DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration     text DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags         text[] DEFAULT '{}';

-- 3. Index for fast week lookups
CREATE INDEX IF NOT EXISTS idx_tasks_week_id ON tasks(week_id);
CREATE INDEX IF NOT EXISTS idx_tasks_backlog ON tasks(week_id) WHERE week_id IS NULL;

-- 4. Enable RLS policies if needed (matches existing tasks pattern)
ALTER TABLE weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON weeks FOR ALL USING (true) WITH CHECK (true);
