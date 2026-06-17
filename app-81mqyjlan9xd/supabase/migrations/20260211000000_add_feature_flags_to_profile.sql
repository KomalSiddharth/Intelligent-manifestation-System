-- Add feature_flags to mind_profile to support cloud-synced toggles
ALTER TABLE mind_profile ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}'::jsonb;
