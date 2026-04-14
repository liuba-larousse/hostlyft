create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  html_content text not null,
  file_name text,
  created_by text,
  created_at timestamptz default now()
);
