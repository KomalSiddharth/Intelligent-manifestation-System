-- Run this in your Supabase SQL Editor to clear ALL content and start from scratch.

-- 1. Delete all chunks (Embeddings)
DELETE FROM knowledge_chunks;

-- 2. Delete all knowledge sources (Metadata)
DELETE FROM knowledge_sources;

-- 3. Delete all legacy content items
DELETE FROM content_items;
