-- Migration: Add routing_metrics table for performance tracking
-- This enables Layer 6: Performance Monitoring

CREATE TABLE IF NOT EXISTS routing_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    intent TEXT NOT NULL,
    complexity INTEGER NOT NULL CHECK (complexity >= 1 AND complexity <= 10),
    model_used TEXT NOT NULL,
    reasoning TEXT,
    estimated_cost DECIMAL(10, 6),
    response_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    is_critical BOOLEAN DEFAULT false,
    user_satisfaction INTEGER CHECK (user_satisfaction >= 1 AND user_satisfaction <= 5),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_routing_metrics_user ON routing_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_routing_metrics_created ON routing_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routing_metrics_model ON routing_metrics(model_used);
CREATE INDEX IF NOT EXISTS idx_routing_metrics_intent ON routing_metrics(intent);
CREATE INDEX IF NOT EXISTS idx_routing_metrics_critical ON routing_metrics(is_critical) WHERE is_critical = true;

-- RLS Policies
ALTER TABLE routing_metrics ENABLE ROW LEVEL SECURITY;

-- Allow service role to insert metrics
CREATE POLICY "Service role can insert routing metrics"
ON routing_metrics
FOR INSERT
TO service_role
WITH CHECK (true);

-- Allow users to view their own metrics
CREATE POLICY "Users can view their own routing metrics"
ON routing_metrics
FOR SELECT
USING (auth.uid()::text = user_id);

-- Analytics view for admins
CREATE OR REPLACE VIEW routing_analytics AS
SELECT 
    DATE_TRUNC('day', created_at) as date,
    intent,
    model_used,
    COUNT(*) as request_count,
    AVG(response_time_ms) as avg_latency_ms,
    AVG(estimated_cost) as avg_cost,
    SUM(estimated_cost) as total_cost,
    AVG(CASE WHEN user_satisfaction IS NOT NULL THEN user_satisfaction END) as avg_satisfaction,
    SUM(CASE WHEN success THEN 1 ELSE 0 END)::FLOAT / COUNT(*) * 100 as success_rate,
    SUM(CASE WHEN is_critical THEN 1 ELSE 0 END) as critical_queries
FROM routing_metrics
GROUP BY DATE_TRUNC('day', created_at), intent, model_used
ORDER BY date DESC, request_count DESC;

COMMENT ON TABLE routing_metrics IS 'Tracks AI model routing decisions and performance metrics for optimization';
COMMENT ON VIEW routing_analytics IS 'Daily aggregated routing analytics for monitoring and optimization';
