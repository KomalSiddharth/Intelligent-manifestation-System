-- SQL Consolidation: Move all user content to Primary Profile
-- Use this if your content count in the UI is lower than the database count.

-- 1. Run this to see how your data is split
SELECT profile_id, COUNT(*) 
FROM knowledge_sources 
WHERE user_id = '94159cc7-232a-4041-b477-2ac5908a2adf'
GROUP BY profile_id;

-- 2. Run this to MOVE EVERYTHING to your current PRIMARY profile
DO $$
DECLARE
    target_profile_id uuid;
BEGIN
    -- Find the primary profile for your user ID
    SELECT id INTO target_profile_id 
    FROM mind_profile 
    WHERE user_id = '94159cc7-232a-4041-b477-2ac5908a2adf' 
    AND is_primary = true 
    LIMIT 1;

    IF target_profile_id IS NOT NULL THEN
        -- Update Knowledge Sources (Primary table)
        UPDATE knowledge_sources 
        SET profile_id = target_profile_id
        WHERE user_id = '94159cc7-232a-4041-b477-2ac5908a2adf';

        RAISE NOTICE 'Successfully moved content to Primary Profile: %', target_profile_id;
    ELSE
        RAISE NOTICE 'No Primary Profile found to move content to.';
    END IF;
END $$;
