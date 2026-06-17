-- Migration to remove unused routing metrics tables and views
DROP TABLE IF EXISTS public.routing_metrics CASCADE;
DROP TABLE IF EXISTS public.routing_analytics CASCADE;
DROP VIEW IF EXISTS public.model_performance_by_intent CASCADE;

-- Drop related functions if they exist
DROP FUNCTION IF EXISTS public.record_routing_metric;
