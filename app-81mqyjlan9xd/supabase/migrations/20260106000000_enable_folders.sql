-- Migration: Enable Folder Support for Knowledge Sources
-- Description: Adds folder association to the RAG knowledge storage system.

-- 1. Ensure folders table exists and has profile_id
CREATE TABLE IF NOT EXISTS folders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    parent_id uuid REFERENCES folders(id) ON DELETE CASCADE,
    profile_id uuid REFERENCES mind_profile(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- 2. Add profile_id to folders if it doesn't exist (in case table was created by older schema)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'folders' AND column_name = 'profile_id') THEN
        ALTER TABLE folders ADD COLUMN profile_id uuid REFERENCES mind_profile(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Add folder_id to knowledge_sources
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'knowledge_sources' AND column_name = 'folder_id') THEN
        ALTER TABLE knowledge_sources ADD COLUMN folder_id uuid REFERENCES folders(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4. Enable RLS for folders
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies for folders
DROP POLICY IF EXISTS "Users can manage their own folders" ON folders;
CREATE POLICY "Users can manage their own folders"
ON folders FOR ALL
USING (true); -- Simplified for now, or use auth.uid() check if user_id exists

-- Disable RLS for debug/simplicity if required, matching the system's current state
ALTER TABLE folders DISABLE ROW LEVEL SECURITY;
