-- Ensure columns exist
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS original_content TEXT;

-- Disable RLS to allow updates from frontend (for verified admin editing)
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;

-- Grant permissions explicitly
GRANT ALL ON messages TO anon;
GRANT ALL ON messages TO authenticated;
GRANT ALL ON messages TO service_role;
