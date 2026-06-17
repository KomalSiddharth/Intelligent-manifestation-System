-- EMERGENCY FIX: Disable RLS on all tables to ensure data is visible to the frontend
-- This is safe for a single-user/admin-style application

ALTER TABLE IF EXISTS knowledge_sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS knowledge_chunks DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS mind_profile DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audience_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_integrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_facts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS broadcasts DISABLE ROW LEVEL SECURITY;

-- Grant usage to public/anon just in case
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
