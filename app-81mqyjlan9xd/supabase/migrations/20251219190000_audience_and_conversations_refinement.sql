-- Phase 4: Audience & Conversations Refinement
DO $$
BEGIN
    -- 1. Refine audience_users table
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'audience_users') THEN
        -- Add profile_id if not exists
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'audience_users' AND column_name = 'profile_id') THEN
            ALTER TABLE audience_users ADD COLUMN profile_id uuid REFERENCES mind_profile(id) ON DELETE CASCADE;
        END IF;

        -- Add user_id (text) to match our Guest/Auth ID system
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'audience_users' AND column_name = 'user_id') THEN
            ALTER TABLE audience_users ADD COLUMN user_id text;
        END IF;

        -- Add is_active boolean
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'audience_users' AND column_name = 'is_active') THEN
            ALTER TABLE audience_users ADD COLUMN is_active boolean DEFAULT false;
        END IF;

        -- Fix unique constraint on email (should be per profile)
        ALTER TABLE audience_users DROP CONSTRAINT IF EXISTS audience_users_email_key;
        -- Add composite unique if profile_id is not null
        -- But for now, let's just ensure we can have multiple entries
    END IF;

    -- 2. Refine messages table
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'messages') THEN
        -- Add role if not exists
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'role') THEN
            ALTER TABLE messages ADD COLUMN role text DEFAULT 'user' CHECK (role IN ('user', 'assistant', 'system'));
        END IF;
    END IF;

    -- 3. Refine conversations table
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'conversations') THEN
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'title') THEN
            ALTER TABLE conversations ADD COLUMN title text DEFAULT 'New Chat';
        END IF;
    END IF;
END $$;

-- 4. Disable RLS for Audience tables to ensure visibility
ALTER TABLE audience_users DISABLE ROW LEVEL SECURITY;

-- 5. Backfill: Link existing audience users to the primary profile if profile_id is null
UPDATE audience_users au
SET profile_id = mp.id
FROM mind_profile mp
WHERE mp.is_primary = true AND au.profile_id IS NULL;
