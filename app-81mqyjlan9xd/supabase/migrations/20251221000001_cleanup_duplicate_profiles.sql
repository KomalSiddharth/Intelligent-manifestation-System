-- SAFE Cleanup for duplicate mind_profile entries
-- This script merges data and updates references instead of deleting

-- Step 1: View current duplicates
SELECT user_id, COUNT(*) as profile_count, array_agg(id) as profile_ids
FROM mind_profile
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Step 2: For each user, identify the "keeper" profile (most recent with data)
WITH keeper_profiles AS (
    SELECT DISTINCT ON (user_id) 
        id as keeper_id,
        user_id
    FROM mind_profile
    ORDER BY user_id, 
             (purpose IS NOT NULL AND purpose != '') DESC,
             (instructions IS NOT NULL AND array_length(instructions, 1) > 0) DESC,
             updated_at DESC NULLS LAST, 
             created_at DESC
),
duplicate_profiles AS (
    SELECT mp.id as duplicate_id, kp.keeper_id
    FROM mind_profile mp
    JOIN keeper_profiles kp ON mp.user_id = kp.user_id
    WHERE mp.id != kp.keeper_id
)
-- Step 3: Update conversations to point to keeper profile
UPDATE conversations c
SET profile_id = dp.keeper_id
FROM duplicate_profiles dp
WHERE c.profile_id = dp.duplicate_id;

-- Step 4: Update audience_users to point to keeper profile  
UPDATE audience_users au
SET profile_id = dp.keeper_id
FROM duplicate_profiles dp
WHERE au.profile_id = dp.duplicate_id;

-- Step 5: Update knowledge_sources to point to keeper profile
UPDATE knowledge_sources ks
SET profile_id = dp.keeper_id
FROM duplicate_profiles dp
WHERE ks.profile_id = dp.duplicate_id;

-- Step 6: Now safe to delete duplicates
WITH keeper_profiles AS (
    SELECT DISTINCT ON (user_id) id
    FROM mind_profile
    ORDER BY user_id, 
             (purpose IS NOT NULL AND purpose != '') DESC,
             updated_at DESC NULLS LAST, 
             created_at DESC
)
DELETE FROM mind_profile
WHERE id NOT IN (SELECT id FROM keeper_profiles);

-- Step 7: Ensure exactly one primary profile per user
UPDATE mind_profile
SET is_primary = true
WHERE id IN (
    SELECT DISTINCT ON (user_id) id
    FROM mind_profile
    ORDER BY user_id, updated_at DESC NULLS LAST
);

-- Step 8: Verify cleanup - should show one profile per user
SELECT id, user_id, name, is_primary, 
       COALESCE(purpose, 'NULL') as purpose,
       COALESCE(array_length(instructions, 1), 0) as instruction_count,
       created_at, updated_at
FROM mind_profile
ORDER BY user_id, is_primary DESC;
