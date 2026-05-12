-- Listing-to-building group mapping for PriceLabs overrides
create table if not exists listing_groups (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references pricelabs_clients(id) on delete cascade,
  listing_id text not null,          -- PriceLabs listing ID
  listing_name text not null,
  pms text not null default 'guesty',
  building_group text not null,       -- resolved building group (e.g. "29.Millenium", "PH")
  customization_group text,           -- original PriceLabs customization group
  tags text,                          -- comma-separated tags
  base_price numeric,
  min_price numeric,
  bedroom_count integer,
  listing_sync boolean default true,
  airbnb_id text,
  created_at timestamptz default now(),
  unique(client_id, listing_id)
);

create index idx_listing_groups_client on listing_groups(client_id);
create index idx_listing_groups_building on listing_groups(client_id, building_group);
