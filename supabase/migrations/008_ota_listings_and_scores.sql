-- OTA listing URLs per client
CREATE TABLE IF NOT EXISTS ota_listings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid REFERENCES pricelabs_clients(id) ON DELETE CASCADE,
  ota_name      text NOT NULL,           -- 'airbnb' | 'vrbo' | 'booking_com'
  listing_url   text NOT NULL,
  listing_label text DEFAULT '',         -- friendly name / unit name
  created_at    timestamptz DEFAULT now(),
  UNIQUE(client_id, listing_url)
);

CREATE INDEX IF NOT EXISTS idx_ota_listings_client ON ota_listings(client_id);

-- Scraped OTA review scores (one active score per listing, upsert replaces)
CREATE TABLE IF NOT EXISTS ota_scores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    uuid REFERENCES ota_listings(id) ON DELETE CASCADE UNIQUE,
  overall_score numeric(4,2) NOT NULL,   -- e.g. 4.85 or 8.7
  review_count  integer DEFAULT 0,
  scraped_at    timestamptz NOT NULL DEFAULT now(),
  raw_data      jsonb DEFAULT '{}'::jsonb,
  UNIQUE(listing_id)
);

CREATE INDEX IF NOT EXISTS idx_ota_scores_listing ON ota_scores(listing_id);

-- RLS
ALTER TABLE ota_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ota_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON ota_listings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON ota_scores FOR ALL USING (true) WITH CHECK (true);
