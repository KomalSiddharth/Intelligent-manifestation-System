-- Add last_seen tracking for real-time online status
ALTER TABLE audience_users 
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE;

-- Update existing users to have a last_seen timestamp
UPDATE audience_users 
SET last_seen = last_active 
WHERE last_seen IS NULL AND last_active IS NOT NULL;

-- Create index for efficient online status queries
CREATE INDEX IF NOT EXISTS idx_audience_users_last_seen ON audience_users(last_seen DESC);

-- Function to check if user is online (active in last 5 minutes)
CREATE OR REPLACE FUNCTION is_user_online(last_seen_timestamp TIMESTAMP WITH TIME ZONE)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN last_seen_timestamp IS NOT NULL AND last_seen_timestamp > NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql IMMUTABLE;
