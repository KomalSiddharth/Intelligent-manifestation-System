-- Fix for BigInt-to-UUID casting error in match_knowledge RPC
-- This ensures the function can return both bigint IDs (Legacy) and uuid IDs (Modern)
-- by unifying the return type to TEXT.

CREATE OR REPLACE FUNCTION match_knowledge (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_profile_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id text, -- Unified type to avoid BigInt-to-UUID casting errors
  content text,
  source_title text,
  source_url text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY (
    -- Search in knowledge_chunks (New architecture)
    SELECT
      kc.id::text,
      kc.content,
      ks.title as source_title,
      ks.source_url as source_url,
      1 - (kc.embedding <=> query_embedding) AS similarity
    FROM knowledge_chunks kc
    JOIN knowledge_sources ks ON kc.source_id = ks.id
    WHERE (p_profile_id IS NULL OR kc.profile_id = p_profile_id)
      AND 1 - (kc.embedding <=> query_embedding) > match_threshold
    
    UNION ALL

    -- Search in knowledge_base (Old/Fallback architecture)
    SELECT 
      kb.id::text,
      kb.content,
      COALESCE(kb.metadata->>'source_title', kb.metadata->>'filename', 'Legacy Knowledge') as source_title,
      COALESCE(kb.metadata->>'source_url', '') as source_url,
      1 - (kb.embedding <=> query_embedding) AS similarity
    FROM knowledge_base kb
    WHERE (p_profile_id IS NULL OR kb.profile_id = p_profile_id)
      AND 1 - (kb.embedding <=> query_embedding) > match_threshold
    
    ORDER BY similarity DESC
    LIMIT match_count
  );
END;
$$;
