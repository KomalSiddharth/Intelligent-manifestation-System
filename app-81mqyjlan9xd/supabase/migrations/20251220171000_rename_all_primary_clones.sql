-- Rename any profile named 'Primary Clone' or marked as primary to MiteshAI
UPDATE mind_profiles
SET name = 'MiteshAI'
WHERE name = 'Primary Clone' OR is_primary = true;
