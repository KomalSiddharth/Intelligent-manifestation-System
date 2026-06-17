-- Rename the primary mind profile to MiteshAI
UPDATE mind_profiles
SET name = 'MiteshAI'
WHERE is_primary = true;
