-- PriceLabs client credentials
create table if not exists pricelabs_clients (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  email text not null,
  password_encrypted text not null,
  active boolean default true,
  created_at timestamptz default now()
);

-- Daily booking reports (one row per reservation per report date)
create table if not exists booking_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references pricelabs_clients(id) on delete cascade,
  report_date date not null,
  reservation_id text not null,
  listing_name text,
  checkin_date date,
  checkout_date date,
  booked_date date,
  adr numeric,
  rental_revenue numeric,
  total_revenue numeric,
  los integer,
  booking_window integer,
  booking_source text,
  created_at timestamptz default now(),
  unique(client_id, reservation_id, report_date)
);

create index if not exists booking_reports_client_date on booking_reports(client_id, report_date);
create index if not exists booking_reports_date on booking_reports(report_date);
