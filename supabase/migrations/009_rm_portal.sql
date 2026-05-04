-- RM Portal: unified credentials for PriceLabs Revenue Manager accounts
-- Only one row expected — stores the shared RM login

CREATE TABLE IF NOT EXISTS rm_portal_credentials (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL,
  password_encrypted text NOT NULL,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE rm_portal_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON rm_portal_credentials FOR ALL USING (true) WITH CHECK (true);

-- Add connection_type to pricelabs_clients
ALTER TABLE pricelabs_clients ADD COLUMN IF NOT EXISTS connection_type text DEFAULT 'direct';
-- 'direct' = client has own PriceLabs credentials
-- 'rm_portal' = accessed via RM Portal (no individual credentials needed)
