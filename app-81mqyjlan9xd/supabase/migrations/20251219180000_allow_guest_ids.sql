-- Comprehensive Migration to support Guest IDs and Restore Visibility
DO $$
BEGIN
    -- 1. Relax mind_profile constraints
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'mind_profile_user_id_fkey') THEN
        ALTER TABLE mind_profile DROP CONSTRAINT mind_profile_user_id_fkey;
    END IF;
    ALTER TABLE mind_profile ALTER COLUMN user_id TYPE text;

    -- 2. Relax knowledge_sources constraints
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'knowledge_sources') THEN
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'knowledge_sources' AND (constraint_name = 'knowledge_sources_user_id_fkey' OR constraint_name = 'knowledge_sources_user_id_check')) THEN
             ALTER TABLE knowledge_sources DROP CONSTRAINT IF EXISTS knowledge_sources_user_id_fkey;
        END IF;
        ALTER TABLE knowledge_sources ALTER COLUMN user_id TYPE text;
    END IF;

    -- 3. Relax knowledge_chunks constraints
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'knowledge_chunks') THEN
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'knowledge_chunks' AND (constraint_name = 'knowledge_chunks_user_id_fkey')) THEN
             ALTER TABLE knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_user_id_fkey;
        END IF;
        ALTER TABLE knowledge_chunks ALTER COLUMN user_id TYPE text;
    END IF;

    -- 4. Relax conversations constraints (Guest IDs chatting)
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'conversations') THEN
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'conversations' AND (constraint_name = 'conversations_user_id_fkey')) THEN
             ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;
        END IF;
        ALTER TABLE conversations ALTER COLUMN user_id TYPE text;
    END IF;
END $$;

-- 5. Full RLS Bypass for Development
-- (This ensures the creator using Guest Mode can always see their own data)
ALTER TABLE mind_profile DISABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks DISABLE ROW LEVEL SECURITY;
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_facts DISABLE ROW LEVEL SECURITY;

-- Note: In production, you would use proper policies like:
-- CREATE POLICY "Self Access" ON mind_profile FOR ALL USING (user_id = auth.uid()::text OR user_id = current_setting('request.headers')::json->>'x-guest-id');
-- But for current debugging, DISABLING ensures we can at least confirm the data is flowing.
