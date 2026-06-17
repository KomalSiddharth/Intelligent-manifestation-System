-- Fix RLS for user_integrations to allow OAuth callback to save tokens
ALTER TABLE IF EXISTS user_integrations DISABLE ROW LEVEL SECURITY;

-- Ensure public access to necessary tables for dev
ALTER TABLE IF EXISTS folders DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS analytics_metrics DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS insights DISABLE ROW LEVEL SECURITY;
