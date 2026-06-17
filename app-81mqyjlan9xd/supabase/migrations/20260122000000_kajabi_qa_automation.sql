-- Kajabi Q&A Automation Schema
-- Based on Senior's 100% Perfect Plan

-- 1. Main tracking table for Kajabi Posts
CREATE TABLE IF NOT EXISTS kajabi_qa_posts (
  -- Identity
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kajabi_post_id text UNIQUE NOT NULL,
  kajabi_post_url text NOT NULL,
  
  -- Content
  question_text text NOT NULL,
  author_name text,
  author_email text,
  
  -- Processing status
  status text DEFAULT 'detected' CHECK (
    status IN (
      'detected',      -- Found in scraping
      'extracted',     -- Content extracted
      'drafted',       -- AI reply generated
      'filled',        -- Textarea filled
      'published',     -- Manually sent
      'skipped',       -- Decided not to answer
      'error'          -- Processing failed
    )
  ),
  
  -- AI draft
  ai_draft text,
  confidence_score float,
  knowledge_chunks_used integer,
  
  -- Timestamps
  first_seen_at timestamptz DEFAULT now(),
  extracted_at timestamptz,
  drafted_at timestamptz,
  filled_at timestamptz,
  published_at timestamptz,
  
  -- Metadata
  profile_id uuid REFERENCES mind_profile(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Audit
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_kajabi_qa_status ON kajabi_qa_posts(status);
CREATE INDEX IF NOT EXISTS idx_kajabi_qa_created ON kajabi_qa_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kajabi_qa_profile ON kajabi_qa_posts(profile_id);

-- 2. Configuration table for Kajabi credentials
CREATE TABLE IF NOT EXISTS kajabi_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES mind_profile(id) UNIQUE,
  
  -- Credentials (Stored as plain text for now, should use Vault in production)
  kajabi_email text,
  kajabi_password text,
  
  -- Settings
  auto_fill_enabled boolean DEFAULT true,
  auto_send_enabled boolean DEFAULT false,
  confidence_threshold float DEFAULT 0.75,
  
  -- Rate limiting
  max_posts_per_run integer DEFAULT 20,
  delay_between_posts_ms integer DEFAULT 5000,
  
  -- Status
  last_run_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Error logging table
CREATE TABLE IF NOT EXISTS kajabi_automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Context
  post_id uuid REFERENCES kajabi_qa_posts(id),
  action text NOT NULL,  -- 'login', 'scrape', 'fill', etc.
  
  -- Error details
  error_type text,
  error_message text,
  stack_trace text,
  
  -- Environment
  browser_version text,
  page_url text,
  screenshot_url text,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logs_created ON kajabi_automation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_post ON kajabi_automation_logs(post_id);

-- Update timestamp trigger (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
        CREATE FUNCTION update_updated_at()
        RETURNS TRIGGER AS $trigger$
        BEGIN
          NEW.updated_at = now();
          RETURN NEW;
        END;
        $trigger$ LANGUAGE plpgsql;
    END IF;
END $$;

-- Apply trigger to tables
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_kajabi_qa_posts_updated_at') THEN
        CREATE TRIGGER update_kajabi_qa_posts_updated_at
          BEFORE UPDATE ON kajabi_qa_posts
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;

-- Add RLS (Disabled for initial development/admin use)
ALTER TABLE kajabi_qa_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE kajabi_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kajabi_automation_logs ENABLE ROW LEVEL SECURITY;

-- Simple permissive policies for authenticated users (Admins)
CREATE POLICY "Allow all for authenticated users on kajabi_qa_posts" ON kajabi_qa_posts FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated users on kajabi_configs" ON kajabi_configs FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow all for authenticated users on kajabi_automation_logs" ON kajabi_automation_logs FOR ALL TO authenticated USING (true);
