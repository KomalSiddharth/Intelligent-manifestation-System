-- Migration: Add chunk_index to knowledge_chunks for Recursive RAG
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS chunk_index integer DEFAULT 0;

-- Optional: Create an index to speed up neighbor lookups
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source_index ON knowledge_chunks(source_id, chunk_index);
