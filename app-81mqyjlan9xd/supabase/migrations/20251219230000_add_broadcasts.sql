-- Create broadcasts table
CREATE TABLE IF NOT EXISTS broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES mind_profile(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  targeting jsonb DEFAULT '{}'::jsonb, -- e.g., { "tags": ["VIP"], "min_engagement": 5 }
  sent_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;

-- Allow all for dev
CREATE POLICY "Allow all for dev on broadcasts" ON broadcasts FOR ALL TO public USING (true) WITH CHECK (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_broadcasts_status_time ON broadcasts(status, scheduled_at);
