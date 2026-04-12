-- Link pricelabs_clients to HubSpot contacts
alter table pricelabs_clients
  add column if not exists hubspot_contact_id text unique;
