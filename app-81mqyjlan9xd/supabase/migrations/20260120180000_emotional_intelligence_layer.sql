-- Migration: Emotional Intelligence Layer
-- Adds support for journey tracking, crisis detection, and urgency tagging.

-- 1. Create Emotional History Table (Time-series)
CREATE TABLE IF NOT EXISTS public.user_emotional_history (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID NOT NULL, -- Reference to audience_users (Internal UUID)
    profile_id UUID REFERENCES public.mind_profile(id) ON DELETE CASCADE,
    session_id UUID, -- Optional: Link to a specific conversation
    emotion_category TEXT NOT NULL, -- e.g. 'Anxiety', 'Joy', 'Despair'
    intensity FLOAT DEFAULT 0.5, -- Range 0.0 to 1.0
    urgency_level TEXT DEFAULT 'low', -- low, medium, high, critical
    crisis_detected BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Admin Alerts Table
CREATE TABLE IF NOT EXISTS public.admin_alerts (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID NOT NULL,
    session_id UUID,
    alert_type TEXT NOT NULL, -- e.g. 'CRISIS_SIGNAL', 'RAPID_DECLINE'
    message TEXT,
    severity TEXT DEFAULT 'high', -- medium, high, critical
    status TEXT DEFAULT 'pending', -- pending, reviewed, resolved
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Indexing for Analytics
CREATE INDEX IF NOT EXISTS idx_emotional_history_user ON public.user_emotional_history(user_id);
CREATE INDEX IF NOT EXISTS idx_emotional_history_created ON public.user_emotional_history(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_status ON public.admin_alerts(status);

-- 4. RPC for Atomic Emotional Update
CREATE OR REPLACE FUNCTION record_emotional_event(
    p_user_id UUID,
    p_profile_id UUID,
    p_session_id UUID,
    p_emotion TEXT,
    p_intensity FLOAT,
    p_urgency TEXT,
    p_crisis BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Record history
    INSERT INTO public.user_emotional_history (user_id, profile_id, session_id, emotion_category, intensity, urgency_level, crisis_detected)
    VALUES (p_user_id, p_profile_id, p_session_id, p_emotion, p_intensity, p_urgency, p_crisis);

    -- If critical/crisis, create an alert
    IF p_urgency = 'critical' OR p_crisis = true THEN
        INSERT INTO public.admin_alerts (user_id, session_id, alert_type, message, severity)
        VALUES (
            p_user_id, 
            p_session_id, 
            CASE WHEN p_crisis THEN 'CRISIS_SIGNAL' ELSE 'HIGH_URGENCY' END,
            'User detected in state: ' || p_emotion || ' (Intensity: ' || p_intensity || ')',
            CASE WHEN p_urgency = 'critical' THEN 'critical' ELSE 'high' END
        );
    END IF;
END;
$$;

-- 5. Enable RLS
ALTER TABLE public.user_emotional_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

-- Policies (Admin Read)
DROP POLICY IF EXISTS "Allow admin read emotional history" ON public.user_emotional_history;
CREATE POLICY "Allow admin read emotional history" ON public.user_emotional_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin read alerts" ON public.admin_alerts;
CREATE POLICY "Allow admin read alerts" ON public.admin_alerts FOR SELECT USING (true);
