-- Update match_knowledge to support profile_id filtering and knowledge_chunks
CREATE OR REPLACE FUNCTION match_knowledge (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_profile_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY (
    -- Search in knowledge_chunks (New architecture)
    SELECT
      kc.id,
      kc.content,
      ks.metadata,
      1 - (kc.embedding <=> query_embedding) AS similarity
    FROM knowledge_chunks kc
    JOIN knowledge_sources ks ON kc.source_id = ks.id
    WHERE (p_profile_id IS NULL OR kc.profile_id = p_profile_id)
      AND 1 - (kc.embedding <=> query_embedding) > match_threshold
    
    UNION ALL

    -- Search in knowledge_base (Old/Fallback architecture)
    SELECT 
      kb.id::uuid,
      kb.content,
      kb.metadata,
      1 - (kb.embedding <=> query_embedding) AS similarity
    FROM knowledge_base kb
    WHERE (p_profile_id IS NULL OR kb.profile_id = p_profile_id)
      AND 1 - (kb.embedding <=> query_embedding) > match_threshold
    
    ORDER BY similarity DESC
    LIMIT match_count
  );
END;
$$;
