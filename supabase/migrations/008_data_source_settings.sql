-- ============================================================
-- Migration 008: Data Source Settings & Manual Function Triggers
-- ============================================================

-- Data Source Settings table
CREATE TABLE IF NOT EXISTS data_source_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_data_source_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER data_source_settings_updated_at
  BEFORE UPDATE ON data_source_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_data_source_settings_updated_at();

-- Enable RLS
ALTER TABLE data_source_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated users can view data sources"
  ON data_source_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can update
CREATE POLICY "Admins can update data sources"
  ON data_source_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND r.name = 'admin'
    )
  );

-- Seed the 5 data sources
INSERT INTO data_source_settings (source_name, display_name, description, enabled) VALUES
  ('finnhub', 'Finnhub', 'Real-time forex news with AI-extracted currency relevance and impact scoring. Requires API key.', true),
  ('forexfactory', 'Forex Factory', 'Weekly economic calendar with impact levels, forecasts, and actual data via FairEconomy mirror.', true),
  ('rss', 'RSS Feeds', 'Aggregated news from Investing.com, MarketWatch, and Reuters RSS feeds.', true),
  ('alphavantage', 'Alpha Vantage', 'Macro-economic news sentiment analysis with topic tagging. Free tier: 25 requests/day.', true),
  ('fred', 'FRED', 'Official US Federal Reserve economic data — CPI, GDP, NFP, unemployment, Fed funds rate, and more.', true)
ON CONFLICT (source_name) DO NOTHING;

-- Add new permissions to admin role
INSERT INTO permissions (name, description) VALUES
  ('manage_data_sources', 'Enable or disable data sources'),
  ('trigger_functions', 'Manually trigger edge functions from admin panel')
ON CONFLICT (name) DO NOTHING;

-- Link new permissions to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
  AND p.name IN ('manage_data_sources', 'trigger_functions')
ON CONFLICT DO NOTHING;
