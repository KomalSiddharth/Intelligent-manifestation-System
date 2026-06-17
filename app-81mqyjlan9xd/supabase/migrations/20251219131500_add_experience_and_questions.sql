-- Migration to add Experience Settings and Suggested Questions columns to mind_profile table
ALTER TABLE mind_profile 
ADD COLUMN IF NOT EXISTS experience_settings JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS suggested_questions JSONB DEFAULT '[]'::jsonb;
