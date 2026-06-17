/*
# Add Sample Data for AI Creator Platform

## Overview
Adds sample data for demonstration purposes including:
- Analytics metrics for the last 7 days
- Sample content items
- Sample audience users
- Sample insights
- Sample folders

## Purpose
This data allows the platform to display meaningful information immediately upon launch.

## Note
This is demonstration data. In production, users will add their own content and audience.
*/

-- Insert sample folders
INSERT INTO folders (name) VALUES
  ('AI Course'),
  ('YouTube Videos'),
  ('Podcast Transcripts'),
  ('Documents'),
  ('Workshop Materials')
ON CONFLICT DO NOTHING;

-- Insert sample content items
INSERT INTO content_items (title, source_type, word_count, folder_id, status, metadata) VALUES
  ('Manifest Your 100 Cr Dreams Everyday | Pillow Technique...', 'YouTube', 1316, (SELECT id FROM folders WHERE name = 'YouTube Videos' LIMIT 1), 'active', '{"source": "Feed"}'),
  ('Multiple Sources of Income = Passive Income =...', 'YouTube', 129, (SELECT id FROM folders WHERE name = 'YouTube Videos' LIMIT 1), 'active', '{"source": "Feed"}'),
  ('Wealth Mastery Workshop Free For All | How to Attract...', 'YouTube', 15428, (SELECT id FROM folders WHERE name = 'Workshop Materials' LIMIT 1), 'active', '{"source": "Feed"}'),
  ('Why Your Affirmations Aren''t Working (Yet!) | The Power o...', 'YouTube', 65, (SELECT id FROM folders WHERE name = 'YouTube Videos' LIMIT 1), 'active', '{"source": "Feed"}'),
  ('This 1 Step Can HELP You Get Clarity in 30 Days Findin...', 'Document', 892, (SELECT id FROM folders WHERE name = 'Documents' LIMIT 1), 'active', '{"source": "Feed"}'),
  ('AI Fundamentals Course', 'Document', 45230, (SELECT id FROM folders WHERE name = 'AI Course' LIMIT 1), 'active', '{}'),
  ('Introduction to Machine Learning', 'Document', 23450, (SELECT id FROM folders WHERE name = 'AI Course' LIMIT 1), 'active', '{}'),
  ('Deep Learning Basics', 'YouTube', 8920, (SELECT id FROM folders WHERE name = 'YouTube Videos' LIMIT 1), 'active', '{}'),
  ('Neural Networks Explained', 'YouTube', 12340, (SELECT id FROM folders WHERE name = 'YouTube Videos' LIMIT 1), 'active', '{}'),
  ('Podcast Episode 1: AI Ethics', 'Document', 5670, (SELECT id FROM folders WHERE name = 'Podcast Transcripts' LIMIT 1), 'active', '{}')
ON CONFLICT DO NOTHING;

-- Insert sample audience users
INSERT INTO audience_users (name, email, tags, message_count, status, last_active) VALUES
  ('shraddha2814', 'shraddha@example.com', ARRAY[]::text[], 0, 'active', '2025-12-06'),
  ('raajanawagekar', 'raajana@example.com', ARRAY['AccountabilityCoach'], 0, 'active', '2025-12-06'),
  ('anil2008nz', 'anil@example.com', ARRAY['AccountabilityCoach'], 0, 'active', '2025-12-06'),
  ('chetnaatrade', 'chetnaa@example.com', ARRAY[]::text[], 0, 'active', '2025-12-06'),
  ('roshi15nov', 'roshi@example.com', ARRAY[]::text[], 0, 'active', '2025-12-06'),
  ('jasnapk97', 'jasna@example.com', ARRAY[]::text[], 0, 'active', '2025-12-06'),
  ('kishank0254', 'kishan@example.com', ARRAY[]::text[], 0, 'active', '2025-12-06'),
  ('megha.sha149', 'megha@example.com', ARRAY[]::text[], 0, 'active', '2025-12-06'),
  ('ritamsharma7', 'ritam@example.com', ARRAY[]::text[], 0, 'active', '2025-12-06'),
  ('swethayedugani09', 'swetha@example.com', ARRAY[]::text[], 0, 'active', '2025-12-06'),
  ('manaskpal9', 'manas@example.com', ARRAY['AccountabilityCoach'], 0, 'active', '2025-12-05')
ON CONFLICT DO NOTHING;

-- Insert analytics metrics for the last 7 days
INSERT INTO analytics_metrics (date, total_conversations, active_users, time_created_minutes, messages_answered, messages_unanswered) VALUES
  ('2025-11-29', 3400, 232, 11200, 5400, 0),
  ('2025-11-30', 3200, 228, 10800, 5200, 0),
  ('2025-12-01', 2800, 220, 10200, 4800, 0),
  ('2025-12-02', 2600, 215, 9800, 4600, 0),
  ('2025-12-03', 2400, 218, 9400, 4400, 0),
  ('2025-12-04', 2300, 210, 9200, 4300, 0),
  ('2025-12-05', 2206, 212, 10149, 4411, 0)
ON CONFLICT (date) DO NOTHING;

-- Insert sample insights
INSERT INTO insights (title, description, action_text) VALUES
  ('When the root concern is guilt or self-blame, your audience persists until their experience is reframed with practical exercises', 'Curate a toolkit of guilt-reframing practices for common life domains', 'Go Deeper'),
  ('Your most engaged users are seeking accountability and structure', 'Consider creating a dedicated accountability program or coaching track', 'View Details'),
  ('Content about manifestation and wealth creation drives the highest engagement', 'Expand your content library in these high-performing topics', 'Explore Topics')
ON CONFLICT DO NOTHING;