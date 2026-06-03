-- ============================================================
-- ZOOM ATTENDANCE — Schema Update
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add zoom_webinar_id column to member_attendance
ALTER TABLE member_attendance
  ADD COLUMN IF NOT EXISTS zoom_webinar_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS zoom_meeting_uuid VARCHAR(255);

-- Drop old unique constraint (session_date + type not enough —
-- multiple sessions can happen on same day)
ALTER TABLE member_attendance
  DROP CONSTRAINT IF EXISTS member_attendance_audience_user_id_session_date_session_type_key;

-- New unique constraint: one record per user per webinar
-- Falls back to date+type+name for manual/CSV records
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_user_webinar
  ON member_attendance(audience_user_id, zoom_webinar_id)
  WHERE zoom_webinar_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_user_date_session
  ON member_attendance(audience_user_id, session_date, session_type, session_name)
  WHERE zoom_webinar_id IS NULL;

-- Index for fast attendance stats queries
CREATE INDEX IF NOT EXISTS idx_attendance_webinar_id
  ON member_attendance(zoom_webinar_id)
  WHERE zoom_webinar_id IS NOT NULL;

-- ── Done ──────────────────────────────────────────────────────
-- member_attendance now supports:
--   zoom_api source  → unique by (audience_user_id, zoom_webinar_id)
--   manual/csv       → unique by (audience_user_id, session_date, type, name)
