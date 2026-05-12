-- Add segment column to portfolio_reports to store All vs PH reports separately

alter table portfolio_reports add column if not exists segment text not null default 'all';

-- Drop old unique constraint and create new one with segment
alter table portfolio_reports drop constraint if exists portfolio_reports_client_id_report_date_key;
alter table portfolio_reports add constraint portfolio_reports_client_segment_date_key unique (client_id, report_date, segment);
