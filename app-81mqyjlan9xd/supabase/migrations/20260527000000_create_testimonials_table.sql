-- ============================================================
-- Migration: Create testimonials structured table
-- Purpose:   Store testimonials with person name + date for
--            structured queries alongside vector RAG search.
-- ============================================================

-- 1. Create the testimonials table
CREATE TABLE IF NOT EXISTS public.testimonials (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      UUID        REFERENCES public.mind_profile(id) ON DELETE CASCADE,
    source_id       UUID        REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
    person_name     TEXT,                           -- Parsed from filename e.g. "Swasti Goyal"
    testimonial_date DATE,                          -- Parsed from filename e.g. 2024-03-15
    raw_content     TEXT,                           -- First ~10k chars of transcribed text
    file_name       TEXT,                           -- Original upload filename
    tags            TEXT[]      DEFAULT '{}',       -- Optional labels e.g. ['platinum', 'march-challenge']
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_testimonials_profile_id    ON public.testimonials(profile_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_person_name   ON public.testimonials(person_name);
CREATE INDEX IF NOT EXISTS idx_testimonials_date          ON public.testimonials(testimonial_date);
CREATE INDEX IF NOT EXISTS idx_testimonials_source_id     ON public.testimonials(source_id);

-- 3. Full-text search index on person_name + raw_content
CREATE INDEX IF NOT EXISTS idx_testimonials_fts
    ON public.testimonials
    USING gin(to_tsvector('english', coalesce(person_name, '') || ' ' || coalesce(raw_content, '')));

-- 4. RLS - open read, service role writes (ingest edge function uses service key)
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read testimonials"        ON public.testimonials;
DROP POLICY IF EXISTS "Service insert testimonials"     ON public.testimonials;
DROP POLICY IF EXISTS "Service update testimonials"     ON public.testimonials;
DROP POLICY IF EXISTS "Service delete testimonials"     ON public.testimonials;

CREATE POLICY "Public read testimonials"
    ON public.testimonials FOR SELECT USING (true);

CREATE POLICY "Service insert testimonials"
    ON public.testimonials FOR INSERT WITH CHECK (true);

CREATE POLICY "Service update testimonials"
    ON public.testimonials FOR UPDATE USING (true);

CREATE POLICY "Service delete testimonials"
    ON public.testimonials FOR DELETE USING (true);

-- 5. RPC: get all testimonials for a profile (used in UI + chat-engine)
CREATE OR REPLACE FUNCTION public.get_testimonials(p_profile_id UUID)
RETURNS TABLE (
    id              UUID,
    person_name     TEXT,
    testimonial_date DATE,
    raw_content     TEXT,
    file_name       TEXT,
    tags            TEXT[],
    source_title    TEXT,
    created_at      TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.person_name,
        t.testimonial_date,
        t.raw_content,
        t.file_name,
        t.tags,
        ks.title AS source_title,
        t.created_at
    FROM public.testimonials t
    LEFT JOIN public.knowledge_sources ks ON ks.id = t.source_id
    WHERE t.profile_id = p_profile_id
    ORDER BY t.testimonial_date DESC NULLS LAST, t.created_at DESC;
END;
$$;

-- 6. RPC: search testimonials by person name (partial match)
CREATE OR REPLACE FUNCTION public.search_testimonials(p_profile_id UUID, p_name TEXT)
RETURNS TABLE (
    id              UUID,
    person_name     TEXT,
    testimonial_date DATE,
    raw_content     TEXT,
    file_name       TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.person_name,
        t.testimonial_date,
        t.raw_content,
        t.file_name
    FROM public.testimonials t
    WHERE t.profile_id = p_profile_id
      AND t.person_name ILIKE '%' || p_name || '%'
    ORDER BY t.testimonial_date DESC NULLS LAST;
END;
$$;
