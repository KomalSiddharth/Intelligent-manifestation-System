-- Migration: Backfill zero word counts for ALL types in knowledge_sources

-- 1. Update word_count for ANY item where it is 0 or null but has content
UPDATE knowledge_sources 
SET word_count = array_length(regexp_split_to_array(content, '\s+'), 1)
WHERE (word_count IS NULL OR word_count = 0)
  AND content IS NOT NULL;

-- 2. Optional: Log the result (for debugging in SQL editor)
DO $$
DECLARE
    updated_count integer;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled word_count for % items.', updated_count;
END $$;
