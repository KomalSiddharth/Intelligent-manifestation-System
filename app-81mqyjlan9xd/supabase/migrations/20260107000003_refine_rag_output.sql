-- Update match_knowledge to return chunk_index and source_id for Recursive RAG
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
    -- Search in knowledge_chunks (New architecture)
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

    -- Search in knowledge_base (Old/Fallback architecture)
    -- Map its metadata to source_title and source_url if possible. Chunk index 0 as fallback.
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
    
    ORDER BY similarity DESC
    LIMIT match_count
  );
END;
$$;
