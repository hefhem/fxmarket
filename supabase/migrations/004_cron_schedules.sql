-- ============================================================
-- pg_cron Schedules for Data Pipeline
-- Run these AFTER deploying edge functions
-- ============================================================

-- Fetch events every 4 hours
SELECT cron.schedule(
  'fetch-events-job',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/fetch-events',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Analyze events every 4 hours (30 min after fetch)
SELECT cron.schedule(
  'analyze-events-job',
  '30 */4 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/analyze-events',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Generate daily bias 3 times a day (8am, 2pm, 8pm UTC)
SELECT cron.schedule(
  'generate-bias-job',
  '0 8,14,20 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/generate-daily-bias',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Clean up events older than 90 days (weekly)
SELECT cron.schedule(
  'cleanup-old-events',
  '0 3 * * 0',
  $$
  DELETE FROM economic_events
  WHERE event_datetime < NOW() - INTERVAL '90 days';
  $$
);

-- Clean up old system logs (weekly)
SELECT cron.schedule(
  'cleanup-old-logs',
  '0 4 * * 0',
  $$
  DELETE FROM system_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
  $$
);
