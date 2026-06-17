-- Migration to add profile_id to user_facts and ensure table existence
DO $$
BEGIN
    if NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_facts') THEN
        CREATE TABLE user_facts (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id text NOT NULL, -- audience user id (often from localStorage)
            type text NOT NULL,
            fact text NOT NULL,
            session_id uuid,
            created_at timestamptz DEFAULT now()
        );
    END IF;

    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_facts' AND column_name = 'profile_id') THEN
        ALTER TABLE user_facts ADD COLUMN profile_id uuid REFERENCES mind_profile(id) ON DELETE CASCADE;
        
        -- Backfill existing facts to primary profile if they exist
        UPDATE user_facts uf
        SET profile_id = mp.id
        FROM mind_profile mp
        WHERE mp.is_primary = true;
    END IF;
END $$;
