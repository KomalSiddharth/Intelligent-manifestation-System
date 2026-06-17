-- Add new columns to mind_profile table
alter table mind_profile
add column purpose text,
add column instructions jsonb default '[]'::jsonb,
add column social_links jsonb default '[]'::jsonb;
