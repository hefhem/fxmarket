-- Migration 014: Add SMTP as a direct email provider option
-- Uses Cloudflare Pages Function as SMTP relay since Supabase Edge Functions
-- cannot make raw TCP connections.

-- Drop the old CHECK constraint and add one that includes 'smtp'
ALTER TABLE smtp_settings DROP CONSTRAINT IF EXISTS smtp_settings_provider_check;
ALTER TABLE smtp_settings ADD CONSTRAINT smtp_settings_provider_check
  CHECK (provider IN ('resend', 'sendgrid', 'brevo', 'smtp'));

COMMENT ON COLUMN smtp_settings.provider IS 'Email provider: resend, sendgrid, brevo, or smtp (via Cloudflare relay)';
