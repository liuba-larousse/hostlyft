-- Portfolio reports from PriceLabs Report Builder
-- Stores the raw parsed report data (months array + byBuilding breakdown)
-- One row per client per report_date (date the report snapshot represents)

create table if not exists portfolio_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references pricelabs_clients(id) on delete cascade,
  report_date date not null default current_date,
  report_data jsonb not null,  -- { months: [...], byBuilding: {...}, fileName, uploadedAt }
  created_at timestamptz not null default now(),
  unique (client_id, report_date)
);

create index idx_portfolio_reports_client_date on portfolio_reports(client_id, report_date desc);

-- Action log data (rows, notes, scratchpad, funnel state, screenshots)
-- Single row per client, stores all action log state as JSONB

create table if not exists action_log_state (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references pricelabs_clients(id) on delete cascade,
  rows jsonb not null default '[]',
  scratchpad text not null default '',
  notes jsonb not null default '[]',
  screenshots jsonb not null default '{"scratchpad":[],"byNote":{}}',
  funnel jsonb not null default '{}',
  states jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (client_id)
);
