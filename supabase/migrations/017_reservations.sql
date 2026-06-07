-- Reservations pulled from the PriceLabs API, stored per listing.
-- Replaces the Playwright-scraped booking_reports flow: reservations are now
-- fetched directly from the PriceLabs API per listing_id, and metrics are
-- computed on top of this table joined with listing_groups.
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references pricelabs_clients(id) on delete cascade,
  listing_id text not null,             -- PriceLabs listing id (matches listing_groups.listing_id)
  pms text,                             -- guesty | airbnb | ...
  reservation_id text not null,         -- PriceLabs/PMS reservation id
  listing_name text,
  status text,                          -- booked | cancelled | ...
  checkin_date date,
  checkout_date date,
  booked_date date,                     -- when the reservation was made
  nights integer,                       -- length of stay
  adr numeric,                          -- average daily rate
  rental_revenue numeric,               -- accommodation revenue (excl. fees)
  total_revenue numeric,                -- incl. fees/taxes
  booking_window integer,               -- days between booked_date and checkin_date
  booking_source text,                  -- Airbnb, VRBO, Direct, ...
  currency text default 'USD',
  raw jsonb,                            -- original API record for debugging / re-mapping
  synced_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(client_id, listing_id, reservation_id)
);

create index if not exists idx_reservations_client_listing on reservations(client_id, listing_id);
create index if not exists idx_reservations_client_booked on reservations(client_id, booked_date);
create index if not exists idx_reservations_client_checkin on reservations(client_id, checkin_date);
create index if not exists idx_reservations_listing on reservations(listing_id);
