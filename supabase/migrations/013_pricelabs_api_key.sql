-- Add API key field to pricelabs_clients for PriceLabs API access
alter table pricelabs_clients add column if not exists api_key_encrypted text;
