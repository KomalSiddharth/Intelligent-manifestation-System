-- ============================================================
-- UNIFIED MEMORY — Schema Migration
-- Run this in Supabase SQL Editor (one time)
-- ============================================================

-- ── 1. Extend audience_users with Kajabi + identity fields ──
ALTER TABLE audience_users
  ADD COLUMN IF NOT EXISTS kajabi_user_id  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS phone           VARCHAR(50),
  ADD COLUMN IF NOT EXISTS plan_tier       VARCHAR(50)  DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS lifetime_value  DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kajabi_joined_at TIMESTAMPTZ;

-- Unique index so we can upsert by kajabi_user_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_audience_kajabi_id
  ON audience_users(kajabi_user_id)
  WHERE kajabi_user_id IS NOT NULL;

-- Fast lookup by email (used for webhook matching)
CREATE INDEX IF NOT EXISTS idx_audience_email_lower
  ON audience_users(lower(email))
  WHERE email IS NOT NULL;

-- ── 2. Course Progress (from Kajabi) ────────────────────────
CREATE TABLE IF NOT EXISTS member_course_progress (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_user_id    UUID REFERENCES audience_users(id) ON DELETE CASCADE,
  user_id             UUID,            -- auth user id (if linked)
  profile_id          UUID,            -- mind_profile id
  course_name         VARCHAR(255)  NOT NULL,
  kajabi_product_id   VARCHAR(255),
  completion_pct      INTEGER      DEFAULT 0
                        CHECK (completion_pct >= 0 AND completion_pct <= 100),
  has_access          BOOLEAN      DEFAULT true,
  last_lesson_title   VARCHAR(500),
  lessons_completed   INTEGER      DEFAULT 0,
  total_lessons       INTEGER,
  days_since_activity INTEGER      DEFAULT 0,
  purchased_at        TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (audience_user_id, kajabi_product_id)
);

CREATE INDEX IF NOT EXISTS idx_course_progress_user
  ON member_course_progress(audience_user_id);

CREATE INDEX IF NOT EXISTS idx_course_progress_user_id
  ON member_course_progress(user_id)
  WHERE user_id IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_course_progress_timestamp()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_course_progress_updated ON member_course_progress;
CREATE TRIGGER trg_course_progress_updated
  BEFORE UPDATE ON member_course_progress
  FOR EACH ROW EXECUTE FUNCTION update_course_progress_timestamp();

-- ── 3. Attendance (DMP / Webinar — Zoom CSV import later) ───
CREATE TABLE IF NOT EXISTS member_attendance (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_user_id  UUID REFERENCES audience_users(id) ON DELETE CASCADE,
  user_id           UUID,
  profile_id        UUID,
  session_type      VARCHAR(50)  NOT NULL DEFAULT 'DMP',
  session_name      VARCHAR(255),
  session_date      DATE         NOT NULL,
  attended          BOOLEAN      DEFAULT true,
  watch_duration_mins INTEGER,
  source            VARCHAR(50)  DEFAULT 'manual',  -- 'zoom_csv' | 'manual' | 'webhook'
  created_at        TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (audience_user_id, session_date, session_type)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user
  ON member_attendance(audience_user_id);

CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON member_attendance(session_date);

-- ── 4. Kajabi Sync Log (audit trail for all events) ─────────
CREATE TABLE IF NOT EXISTS kajabi_sync_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type        VARCHAR(50)  NOT NULL,   -- 'webhook' | 'csv_import' | 'api_sync'
  event_type       VARCHAR(100),            -- 'member.created' | 'purchase.created' etc
  kajabi_payload   JSONB,                   -- raw payload stored for debugging
  status           VARCHAR(20)  DEFAULT 'success', -- 'success' | 'error' | 'skipped'
  error_message    TEXT,
  members_affected INTEGER      DEFAULT 0,
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_type
  ON kajabi_sync_log(sync_type, created_at DESC);

-- ── 5. RLS Policies (service role bypasses these) ───────────
ALTER TABLE member_course_progress  ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_attendance       ENABLE ROW LEVEL SECURITY;
ALTER TABLE kajabi_sync_log         ENABLE ROW LEVEL SECURITY;

-- Service role (Edge Functions) can do everything
CREATE POLICY "service_role_all_course_progress"
  ON member_course_progress FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_attendance"
  ON member_attendance FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_sync_log"
  ON kajabi_sync_log FOR ALL
  USING (auth.role() = 'service_role');

-- ── Done ─────────────────────────────────────────────────────
-- Tables created:
--   member_course_progress  (Kajabi course data)
--   member_attendance       (DMP/Zoom — CSV import later)
--   kajabi_sync_log         (audit trail)
-- audience_users extended:
--   kajabi_user_id, phone, plan_tier, lifetime_value, kajabi_joined_at
