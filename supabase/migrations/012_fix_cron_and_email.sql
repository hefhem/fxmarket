-- Migration 012: Fix cron jobs + Add email notification support
-- ============================================================

-- ============================================================
-- PART 1: Fix Cron Jobs
-- The original cron jobs used current_setting('app.supabase_url')
-- which requires manual setup. This migration recreates them
-- using Supabase vault secrets for secure credential storage.
-- ============================================================

-- IMPORTANT: Before running this migration, you MUST set up vault secrets.
-- Run these in Supabase SQL Editor (replace with YOUR actual values):
--
-- SELECT vault.create_secret('https://YOUR_PROJECT.supabase.co', 'supabase_url');
-- SELECT vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
--
-- Verify with: SELECT * FROM vault.decrypted_secrets WHERE name IN ('supabase_url', 'service_role_key');

-- Enable required extensions (if not already)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop old cron jobs (they may have failed silently)
SELECT cron.unschedule(jobname) FROM cron.job
WHERE jobname IN (
  'fetch-events-job',
  'analyze-events-job',
  'generate-bias-job',
  'cleanup-old-events',
  'cleanup-old-logs',
  'fetch-price-data-morning',
  'compute-indicators-morning',
  'fetch-price-data-evening',
  'compute-indicators-evening',
  'cleanup-old-candles'
);

-- Helper function to call edge functions via vault secrets
CREATE OR REPLACE FUNCTION invoke_edge_function(function_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_url TEXT;
  svc_key TEXT;
BEGIN
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO svc_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE WARNING 'Vault secrets not configured. Run: SELECT vault.create_secret(''your_url'', ''supabase_url''); SELECT vault.create_secret(''your_key'', ''service_role_key'');';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || svc_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- ============================================================
-- Recreate all cron jobs using the helper function
-- ============================================================

-- Fetch events every 4 hours
SELECT cron.schedule('fetch-events-job', '0 */4 * * *', $$SELECT invoke_edge_function('fetch-events');$$);

-- Analyze events every 4 hours (30 min after fetch)
SELECT cron.schedule('analyze-events-job', '30 */4 * * *', $$SELECT invoke_edge_function('analyze-events');$$);

-- Generate daily bias 3 times a day (8am, 2pm, 8pm UTC)
SELECT cron.schedule('generate-bias-job', '0 8,14,20 * * *', $$SELECT invoke_edge_function('generate-daily-bias');$$);

-- Fetch price data (twice daily: 7am and 7pm UTC)
SELECT cron.schedule('fetch-price-data-morning', '0 7 * * *', $$SELECT invoke_edge_function('fetch-price-data');$$);
SELECT cron.schedule('fetch-price-data-evening', '0 19 * * *', $$SELECT invoke_edge_function('fetch-price-data');$$);

-- Compute indicators (30 min after each price fetch)
SELECT cron.schedule('compute-indicators-morning', '30 7 * * *', $$SELECT invoke_edge_function('compute-indicators');$$);
SELECT cron.schedule('compute-indicators-evening', '30 19 * * *', $$SELECT invoke_edge_function('compute-indicators');$$);

-- Send notification after bias generation (8:15am, 2:15pm, 8:15pm UTC)
SELECT cron.schedule('send-notifications-job', '15 8,14,20 * * *', $$SELECT invoke_edge_function('send-push-notification');$$);

-- Clean up events older than 90 days (weekly Sunday 3am)
SELECT cron.schedule('cleanup-old-events', '0 3 * * 0', $$DELETE FROM economic_events WHERE event_datetime < NOW() - INTERVAL '90 days';$$);

-- Clean up old system logs (weekly Sunday 4am)
SELECT cron.schedule('cleanup-old-logs', '0 4 * * 0', $$DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '30 days';$$);

-- Cleanup old candles (weekly Sunday 5am)
SELECT cron.schedule('cleanup-old-candles', '0 5 * * 0', $$DELETE FROM price_candles WHERE open_time < NOW() - INTERVAL '365 days';$$);

-- ============================================================
-- PART 2: SMTP Settings for Email Notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS smtp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host VARCHAR(255) NOT NULL DEFAULT '',
  port INTEGER NOT NULL DEFAULT 587,
  username VARCHAR(255) NOT NULL DEFAULT '',
  encrypted_password TEXT NOT NULL DEFAULT '',
  from_email VARCHAR(255) NOT NULL DEFAULT '',
  from_name VARCHAR(100) NOT NULL DEFAULT 'FX Market Analyzer',
  encryption VARCHAR(10) NOT NULL DEFAULT 'tls' CHECK (encryption IN ('none', 'ssl', 'tls')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Only one SMTP config row (singleton pattern)
INSERT INTO smtp_settings (host, port, from_email, is_active)
VALUES ('', 587, '', false)
ON CONFLICT DO NOTHING;

-- Add email notification preference to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT false;

-- RLS for smtp_settings
ALTER TABLE smtp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage SMTP settings" ON smtp_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'admin'
    )
  );

CREATE POLICY "Authenticated users can read SMTP active status" ON smtp_settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- PART 3: New permissions
-- ============================================================

INSERT INTO permissions (name, description, resource, action)
VALUES
  ('manage_smtp', 'Configure SMTP email settings', 'smtp', 'write'),
  ('manage_email_notifications', 'Enable/disable email notifications', 'notifications', 'write')
ON CONFLICT (name) DO NOTHING;

-- Assign manage_smtp to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.name = 'manage_smtp'
ON CONFLICT DO NOTHING;

-- Assign manage_email_notifications to both roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('admin', 'user') AND p.name = 'manage_email_notifications'
ON CONFLICT DO NOTHING;
