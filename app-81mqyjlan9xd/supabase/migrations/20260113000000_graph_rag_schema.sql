-- Create Tables for GraphRAG

-- 1. CLEAN START (Drop existing to fix constraints/references)
DROP TABLE IF EXISTS public.node_source_map CASCADE;
DROP TABLE IF EXISTS public.graph_edges CASCADE;
DROP TABLE IF EXISTS public.graph_nodes CASCADE;

-- 2. Graph Nodes (Entities)
CREATE TABLE public.graph_nodes (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    profile_id UUID REFERENCES public.mind_profile(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- e.g. 'Concept', 'Person', 'Ritual', 'Outcome'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(profile_id, name)
);

-- 3. Graph Edges (Relationships)
CREATE TABLE public.graph_edges (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    source_id UUID REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
    target_id UUID REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL, -- e.g. 'ENHANCES', 'PART_OF'
    weight FLOAT DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(source_id, target_id, relation_type)
);

-- 4. Node to Source Mapping
-- This links graph entities back to the specific text chunks they were found in
CREATE TABLE public.node_source_map (
    node_id UUID REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
    source_id UUID REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
    PRIMARY KEY (node_id, source_id)
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_graph_nodes_name ON public.graph_nodes(name);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_profile ON public.graph_nodes(profile_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON public.graph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON public.graph_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_node_source_node ON public.node_source_map(node_id);
CREATE INDEX IF NOT EXISTS idx_node_source_source ON public.node_source_map(source_id);

-- Enable RLS
ALTER TABLE public.graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_source_map ENABLE ROW LEVEL SECURITY;

-- Ensure knowledge_sources has content column (Fallback for some schemas)
ALTER TABLE public.knowledge_sources ADD COLUMN IF NOT EXISTS content TEXT;

-- 5. Add Sync Tracking to Knowledge Sources (To prevent infinite loops)
ALTER TABLE public.knowledge_sources ADD COLUMN IF NOT EXISTS last_graph_sync TIMESTAMPTZ;

-- Idempotent Policies
DROP POLICY IF EXISTS "Allow public read access to nodes" ON public.graph_nodes;
CREATE POLICY "Allow public read access to nodes" ON public.graph_nodes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read access to edges" ON public.graph_edges;
CREATE POLICY "Allow public read access to edges" ON public.graph_edges FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read access to maps" ON public.node_source_map;
CREATE POLICY "Allow public read access to maps" ON public.node_source_map FOR SELECT USING (true);

-- --- BACKFILL UTILITY RPC ---
-- This function finds sources that haven't been processed into the Knowledge Graph yet.
CREATE OR REPLACE FUNCTION public.get_unmapped_sources(p_limit int)
RETURNS SETOF uuid AS $$
BEGIN
    RETURN QUERY
    SELECT id FROM public.knowledge_sources
    WHERE last_graph_sync IS NULL
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
