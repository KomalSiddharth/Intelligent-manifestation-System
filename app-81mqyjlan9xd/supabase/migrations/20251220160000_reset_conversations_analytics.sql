-- Reset Conversations and Messages
-- This will delete ALL chat history.
TRUNCATE TABLE messages CASCADE;
TRUNCATE TABLE conversations CASCADE;

-- Reset Analytics Metrics
-- This will clear the stats dashboard.
TRUNCATE TABLE analytics_metrics CASCADE;

-- Optional: Reset Trending Topics if needed
TRUNCATE TABLE trending_topics CASCADE;

-- Note: CASCADE ensures that any linked data is also cleaned up.
