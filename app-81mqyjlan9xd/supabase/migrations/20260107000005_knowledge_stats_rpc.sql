-- Migration: Efficient aggregate counts for the Content tab
CREATE OR REPLACE FUNCTION get_total_knowledge_stats(p_profile_id uuid DEFAULT NULL)
RETURNS TABLE (
  total_words bigint,
  total_items bigint
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(word_count), 0)::bigint as total_words,
    COUNT(*)::bigint as total_items
  FROM (
    SELECT word_count FROM knowledge_sources 
    WHERE (p_profile_id IS NULL OR profile_id = p_profile_id)
    UNION ALL
    SELECT word_count FROM content_items
    WHERE (p_profile_id IS NULL OR profile_id = p_profile_id)
  ) combined;
END;
$$;
