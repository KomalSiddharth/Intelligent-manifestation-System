-- ============================================================
-- SESSION RECORDINGS — Zoom Cloud Recording links
-- One row per recorded Zoom session (shared by ALL attendees,
-- not per-user — unlike member_attendance).
-- ============================================================

CREATE TABLE IF NOT EXISTS session_recordings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type    VARCHAR(50)  NOT NULL DEFAULT 'OTHER',
  session_name    VARCHAR(255) NOT NULL,
  session_date    DATE         NOT NULL,
  recording_url   TEXT         NOT NULL,
  password        VARCHAR(50),
  duration_mins   INTEGER,
  zoom_meeting_id VARCHAR(100),
  source          VARCHAR(50)  DEFAULT 'zoom_api',
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- One recording row per Zoom meeting/webinar instance
CREATE UNIQUE INDEX IF NOT EXISTS idx_recordings_meeting_id
  ON session_recordings(zoom_meeting_id)
  WHERE zoom_meeting_id IS NOT NULL;

-- Fast "recent recordings for this program" lookups
CREATE INDEX IF NOT EXISTS idx_recordings_type_date
  ON session_recordings(session_type, session_date DESC);

ALTER TABLE session_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_recordings"
  ON session_recordings FOR ALL
  USING (auth.role() = 'service_role');

-- ── Done ─────────────────────────────────────────────────────
-- session_recordings now stores Zoom Cloud Recording links,
-- classified by program (session_type), for use in chat-engine's
-- "RECENT RECORDINGS" member-brief block.
