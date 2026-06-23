-- Prefer URL-bearing chunks when match scores are close. Testing found cases
-- with many near-duplicate dated sessions of the same recurring lesson (e.g.
-- 24 copies of "Lesson 1 - Demonstration of Advance Ho'oponopono"), where
-- only some copies had a real source_url on file. Embedding similarity alone
-- was picking link-less copies roughly as often as linked ones, so users got
-- "(link unavailable)" even when a linked version of the same lesson existed.
CREATE OR REPLACE FUNCTION match_knowledge (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_profile_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source_id uuid,
  content text,
  source_title text,
  source_url text,
  chunk_index int,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY (
    SELECT
      kc.id,
      kc.source_id,
      kc.content,
      ks.title as source_title,
      ks.source_url as source_url,
      kc.chunk_index,
      1 - (kc.embedding <=> query_embedding) AS similarity
    FROM knowledge_chunks kc
    JOIN knowledge_sources ks ON kc.source_id = ks.id
    WHERE (p_profile_id IS NULL OR kc.profile_id = p_profile_id)
      AND 1 - (kc.embedding <=> query_embedding) > match_threshold

    UNION ALL

    SELECT
      kb.id::uuid,
      NULL::uuid as source_id,
      kb.content,
      COALESCE(kb.metadata->>'source_title', kb.metadata->>'filename', 'Legacy Knowledge') as source_title,
      COALESCE(kb.metadata->>'source_url', '') as source_url,
      0 as chunk_index,
      1 - (kb.embedding <=> query_embedding) AS similarity
    FROM knowledge_base kb
    WHERE (p_profile_id IS NULL OR kb.profile_id = p_profile_id)
      AND 1 - (kb.embedding <=> query_embedding) > match_threshold

    ORDER BY
      -- Small additive boost for rows with a real, shareable URL so two
      -- near-tied matches resolve in favor of the one the user can
      -- actually click through to.
      similarity + (CASE WHEN source_url IS NOT NULL AND source_url <> '' THEN 0.02 ELSE 0 END) DESC
    LIMIT match_count
  );
END;
$$;
