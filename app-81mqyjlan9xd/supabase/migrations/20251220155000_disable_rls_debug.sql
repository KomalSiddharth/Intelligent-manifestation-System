-- Disable RLS to ensure all data is visible to the frontend
-- This matches the 'local/single-user' nature of the app and fixes visibility for imported data

ALTER TABLE audience_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks DISABLE ROW LEVEL SECURITY;

-- NEW: Disable RLS for conversations and messages so Admin can see them
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE mind_profile DISABLE ROW LEVEL SECURITY;
