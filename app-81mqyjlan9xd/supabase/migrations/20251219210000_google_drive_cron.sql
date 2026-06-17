-- Enable the pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the Google Drive background sync to run every hour
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> with your actual project details if running manually
-- In Supabase, these can often be accessed via environment variables in functions, 
-- but for pg_cron, it's best to use the standard project URL.

SELECT cron.schedule(
  'background-worker-job',
  '*/30 * * * *', -- Every 30 minutes
  $$
  BEGIN
    -- 1. Sync Google Drive
    PERFORM net.http_post(
      url := 'https://' || current_setting('app.settings.project_ref') || '.supabase.co/functions/v1/ingest-content',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{"action": "sync_all_drives"}'::jsonb
    );

    -- 2. Process Broadcasts
    PERFORM net.http_post(
      url := 'https://' || current_setting('app.settings.project_ref') || '.supabase.co/functions/v1/ingest-content',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{"action": "process_broadcasts"}'::jsonb
    );
  END;
  $$
);

-- Note: 'app.settings.project_ref' and 'app.settings.service_role_key' are placeholders 
-- for custom GUC variables you can set in your Supabase project configuration 
-- if you want to avoid hardcoding secrets in migrations.
-- Otherwise, hardcode them below for a quick setup (not recommended for production).
