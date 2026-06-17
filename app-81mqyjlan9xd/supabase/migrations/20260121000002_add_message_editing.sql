-- Add columns for message editing and verification
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS is_edited boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS original_content text;

-- Add RLS policy or ensure updates are allowed (Assuming policies are open or handled by service role/admin checks in API)
-- For now, we rely on the application layer (admin-only UI) and existing RLS disabled for dev/admins.
