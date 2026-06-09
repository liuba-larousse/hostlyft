-- Store the PriceLabs listing id alongside listing_name so two listings that
-- share the same name stay distinct across bookings, occupancy, OTA URLs and
-- scores (previously everything was keyed by listing name, which merged them).

alter table booking_reports add column if not exists listing_id text;
alter table ota_listings   add column if not exists pl_listing_id text;

create index if not exists idx_booking_reports_client_listing
  on booking_reports (client_id, listing_id);
