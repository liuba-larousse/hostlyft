-- Add portfolio_reports and weeks_report columns to action_log_state
-- Removes localStorage dependency — all Action Log data in Supabase

alter table action_log_state add column if not exists portfolio_reports jsonb not null default '{}';
alter table action_log_state add column if not exists weeks_report jsonb;
