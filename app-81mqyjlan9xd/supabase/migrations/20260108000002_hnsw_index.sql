-- Verify and Create HNSW Index for Vector Search Optimization
-- This ensures fast vector similarity search at scale

-- Check if HNSW index exists, create if missing
DO $$
BEGIN
    -- Check if index exists
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE tablename = 'knowledge_chunks' 
        AND indexname = 'knowledge_chunks_embedding_idx'
    ) THEN
        -- Create HNSW index with optimal parameters
        CREATE INDEX knowledge_chunks_embedding_idx 
        ON knowledge_chunks 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
        
        RAISE NOTICE 'HNSW index created on knowledge_chunks.embedding';
    ELSE
        RAISE NOTICE 'HNSW index already exists on knowledge_chunks.embedding';
    END IF;
END $$;

-- Verify index is being used (for manual testing)
-- Run this query to check execution plan:
-- EXPLAIN ANALYZE
-- SELECT * FROM knowledge_chunks
-- ORDER BY embedding <=> '[your_vector_here]'::vector
-- LIMIT 20;
