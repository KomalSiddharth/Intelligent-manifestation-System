create table if not exists site_access_codes (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  code text not null unique,
  is_active boolean default true,
  created_at timestamptz default now()
);

create or replace function validate_access_code(p_code text)
returns boolean
language sql security definer
as $$
  select exists (
    select 1 from site_access_codes
    where code = p_code and is_active = true
  );
$$;

grant execute on function validate_access_code(text) to anon;
