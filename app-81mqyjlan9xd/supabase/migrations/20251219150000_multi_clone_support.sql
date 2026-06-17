-- Phase 3: Multi-Clone Migration

-- 1. Modify mind_profile to allow multiple profiles per user
DO $$
BEGIN
    -- Drop existing PK constraint
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'mind_profile_pkey' AND table_name = 'mind_profile') THEN
        ALTER TABLE mind_profile DROP CONSTRAINT mind_profile_pkey CASCADE;
    END IF;

    -- Add unique ID if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mind_profile' AND column_name = 'id') THEN
        ALTER TABLE mind_profile ADD COLUMN id uuid DEFAULT gen_random_uuid();
    END IF;

    -- Add PRIMARY KEY
    -- Note: Ensure id is unique before adding PK
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_type = 'PRIMARY KEY' AND table_name = 'mind_profile') THEN
        ALTER TABLE mind_profile ADD PRIMARY KEY (id);
    END IF;

    -- Add name and is_primary
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mind_profile' AND column_name = 'name') THEN
        ALTER TABLE mind_profile ADD COLUMN name text DEFAULT 'Primary Clone';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mind_profile' AND column_name = 'is_primary') THEN
        ALTER TABLE mind_profile ADD COLUMN is_primary boolean DEFAULT false;
    END IF;
END $$;

-- 2. Update existing data to have is_primary = true for the first profile of each user
WITH first_profiles AS (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as rn
    FROM mind_profile
  ) t WHERE rn = 1
)
UPDATE mind_profile SET is_primary = true WHERE id IN (SELECT id FROM first_profiles);

-- 3. Add profile_id to knowledge systems
DO $$
BEGIN
    -- knowledge_sources
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'knowledge_sources') THEN
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'knowledge_sources' AND column_name = 'profile_id') THEN
            ALTER TABLE knowledge_sources ADD COLUMN profile_id uuid REFERENCES mind_profile(id) ON DELETE CASCADE;
            
            -- Backfill
            UPDATE knowledge_sources ks
            SET profile_id = mp.id
            FROM mind_profile mp
            WHERE ks.user_id = mp.user_id AND mp.is_primary = true;
        END IF;
    END IF;
    
    -- knowledge_chunks
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'knowledge_chunks') THEN
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'knowledge_chunks' AND column_name = 'profile_id') THEN
            ALTER TABLE knowledge_chunks ADD COLUMN profile_id uuid REFERENCES mind_profile(id) ON DELETE CASCADE;

            -- Backfill
            UPDATE knowledge_chunks kc
            SET profile_id = ks.profile_id
            FROM knowledge_sources ks
            WHERE kc.source_id = ks.id;
        END IF;
    END IF;

    -- knowledge_base (Fallback)
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'knowledge_base') THEN
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'knowledge_base' AND column_name = 'profile_id') THEN
            ALTER TABLE knowledge_base ADD COLUMN profile_id uuid REFERENCES mind_profile(id) ON DELETE CASCADE;
            
            -- Backfill
            UPDATE knowledge_base kb
            SET profile_id = mp.id
            FROM mind_profile mp
            WHERE kb.user_id = mp.user_id AND mp.is_primary = true;
        END IF;
    END IF;
END $$;

-- 4. Add profile_id to conversations
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'profile_id') THEN
        ALTER TABLE conversations ADD COLUMN profile_id uuid REFERENCES mind_profile(id) ON DELETE CASCADE;

        -- Backfill conversations (Linked to primary profile)
        UPDATE conversations c
        SET profile_id = mp.id
        FROM mind_profile mp
        WHERE mp.is_primary = true;
    END IF;
END $$;
