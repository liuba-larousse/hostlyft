alter table booking_reports
  add column if not exists currency text default 'USD';
