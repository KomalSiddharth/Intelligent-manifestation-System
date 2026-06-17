-- Migration: Google Drive Integration Support
-- Adds storage for external integration tokens (OAuth)

CREATE TABLE IF NOT EXISTS user_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES mind_profile(id) ON DELETE CASCADE,
  platform text NOT NULL, -- e.g., 'google_drive'
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(profile_id, platform)
);

-- Enable RLS and setup permissive policies for dev
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for dev on integrations"
ON user_integrations FOR ALL
USING (true)
WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_integrations_profile ON user_integrations(profile_id);
CREATE INDEX IF NOT EXISTS idx_integrations_platform ON user_integrations(platform);
