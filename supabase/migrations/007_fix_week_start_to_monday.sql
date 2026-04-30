-- Fix any week_start dates that aren't Mondays
-- April 28, 2026 is a Tuesday — should be April 27 (Monday)
UPDATE weeks SET week_start = '2026-04-27' WHERE week_start = '2026-04-28';
