-- Listing channel/OTA links pulled from the PriceLabs API (/v1/listings).
-- PriceLabs connects each listing to a PMS/channel; where the listing payload
-- carries the public OTA URL (or an id we can build one from), we store it so
-- the dashboard can deep-link to the Airbnb / Booking.com listing.
alter table listing_groups
  add column if not exists listing_url text,   -- generic listing/channel URL if provided
  add column if not exists airbnb_url  text,   -- Airbnb listing URL
  add column if not exists booking_url text,   -- Booking.com listing URL
  add column if not exists raw jsonb;          -- original PriceLabs listing record
