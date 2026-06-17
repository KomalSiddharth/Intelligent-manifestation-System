-- Add unique constraint to audience_users(user_id) to support upsert operations
-- This is critical for guest sessions and chat identity sync

DO $$
BEGIN
    -- 1. Ensure any duplicates are cleaned up (keep the most recent ones)
    DELETE FROM audience_users
    WHERE id NOT IN (
        SELECT DISTINCT ON (user_id) id
        FROM audience_users
        ORDER BY user_id, last_active DESC NULLS LAST, created_at DESC
    ) AND user_id IS NOT NULL;

    -- 2. Add the unique constraint/index
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'audience_users' AND indexname = 'idx_audience_users_user_id_unique'
    ) THEN
        CREATE UNIQUE INDEX idx_audience_users_user_id_unique ON audience_users(user_id) WHERE user_id IS NOT NULL;
    END IF;

    -- 3. Also ensure conversations.user_id is text if it's not already
    -- (Safety check in case previous migration failed)
    ALTER TABLE conversations ALTER COLUMN user_id TYPE text;
END $$;
