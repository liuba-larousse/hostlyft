-- Store per-client PriceLabs Report Builder URLs
-- JSON format: {"all": "https://app.pricelabs.co/report-builder/9276", "building": "...", ...}
alter table pricelabs_clients add column if not exists report_urls jsonb;
