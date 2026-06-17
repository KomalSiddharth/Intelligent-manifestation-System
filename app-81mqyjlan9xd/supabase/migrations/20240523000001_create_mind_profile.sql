-- Create a table to store the Mind Profile (Personality, Bio, etc.)
create table mind_profile (
  user_id uuid references auth.users not null primary key,
  headline text,
  description text,
  topics jsonb default '[]'::jsonb,
  organizations jsonb default '[]'::jsonb,
  speaking_style text,
  response_settings jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table mind_profile enable row level security;

-- Policies
create policy "Users can view their own profile"
on mind_profile for select
using ( auth.uid() = user_id );

create policy "Users can insert their own profile"
on mind_profile for insert
with check ( auth.uid() = user_id );

create policy "Users can update their own profile"
on mind_profile for update
using ( auth.uid() = user_id );
