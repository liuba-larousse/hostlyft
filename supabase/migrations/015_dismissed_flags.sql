-- Add dismissed_flags column to action_log_state for snooze/remove flag functionality
alter table action_log_state add column if not exists dismissed_flags jsonb not null default '{"snoozed":{},"removed":{}}';
