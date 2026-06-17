-- Add message_id column to routing_metrics for feedback tracking
ALTER TABLE routing_metrics 
ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES messages(id) ON DELETE CASCADE;

-- Create index for faster feedback lookups
CREATE INDEX IF NOT EXISTS idx_routing_metrics_message ON routing_metrics(message_id);

-- Create a view for model performance by intent
CREATE OR REPLACE VIEW model_performance_by_intent AS
SELECT 
    intent,
    model_used,
    COUNT(*) as usage_count,
    AVG(user_satisfaction) as avg_satisfaction,
    AVG(response_time_ms) as avg_latency,
    AVG(estimated_cost) as avg_cost,
    SUM(CASE WHEN is_critical THEN 1 ELSE 0 END) as critical_count
FROM routing_metrics
WHERE user_satisfaction IS NOT NULL
GROUP BY intent, model_used
ORDER BY intent, avg_satisfaction DESC;

COMMENT ON VIEW model_performance_by_intent IS 'Shows which models perform best for each intent based on user feedback';
