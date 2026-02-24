-- Migration 013: Switch from raw SMTP to HTTP-based email providers
-- Supabase Edge Functions don't support raw TCP sockets,
-- so we use HTTP APIs from Resend, SendGrid, or Brevo instead.

ALTER TABLE smtp_settings
  ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'resend'
    CHECK (provider IN ('resend', 'sendgrid', 'brevo')),
  ADD COLUMN IF NOT EXISTS api_key TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN smtp_settings.provider IS 'Email provider: resend, sendgrid, or brevo';
COMMENT ON COLUMN smtp_settings.api_key IS 'API key for the selected email provider';
