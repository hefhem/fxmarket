-- ============================================================
-- Technical Analysis Tables, RLS, Permissions, Cron Schedules
-- ============================================================

-- Price candles (OHLCV) — daily candles per pair
CREATE TABLE price_candles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id UUID NOT NULL REFERENCES currency_pairs(id) ON DELETE CASCADE,
  timeframe VARCHAR(10) NOT NULL DEFAULT 'D',
  open_time TIMESTAMPTZ NOT NULL,
  open DECIMAL(12,6) NOT NULL,
  high DECIMAL(12,6) NOT NULL,
  low DECIMAL(12,6) NOT NULL,
  close DECIMAL(12,6) NOT NULL,
  volume DECIMAL(18,2) DEFAULT 0,
  source VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pair_id, timeframe, open_time)
);

CREATE INDEX idx_candles_pair_time ON price_candles(pair_id, timeframe, open_time DESC);

-- Computed technical indicators per pair per day
CREATE TABLE technical_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id UUID NOT NULL REFERENCES currency_pairs(id) ON DELETE CASCADE,
  indicator_date DATE NOT NULL,
  timeframe VARCHAR(10) NOT NULL DEFAULT 'D',
  rsi_14 DECIMAL(6,2),
  macd_line DECIMAL(12,6),
  macd_signal DECIMAL(12,6),
  macd_histogram DECIMAL(12,6),
  sma_20 DECIMAL(12,6),
  sma_50 DECIMAL(12,6),
  sma_200 DECIMAL(12,6),
  ema_12 DECIMAL(12,6),
  ema_26 DECIMAL(12,6),
  support_level DECIMAL(12,6),
  resistance_level DECIMAL(12,6),
  atr_14 DECIMAL(12,6),
  ta_signal VARCHAR(15),
  ta_score DECIMAL(4,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pair_id, timeframe, indicator_date)
);

CREATE INDEX idx_indicators_pair_date ON technical_indicators(pair_id, indicator_date DESC);

-- ============================================================
-- Add TA columns to daily_trade_bias
-- ============================================================

ALTER TABLE daily_trade_bias ADD COLUMN IF NOT EXISTS ta_score DECIMAL(4,2);
ALTER TABLE daily_trade_bias ADD COLUMN IF NOT EXISTS combined_score DECIMAL(4,2);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE price_candles ENABLE ROW LEVEL SECURITY;
ALTER TABLE technical_indicators ENABLE ROW LEVEL SECURITY;

-- Price candles: public read for authenticated users, service role manages
CREATE POLICY "Anyone authenticated can view price candles"
  ON price_candles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage price candles"
  ON price_candles FOR ALL
  USING (auth.role() = 'service_role');

-- Technical indicators: public read for authenticated users, service role manages
CREATE POLICY "Anyone authenticated can view technical indicators"
  ON technical_indicators FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage technical indicators"
  ON technical_indicators FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- Updated_at trigger for technical_indicators
-- ============================================================

CREATE OR REPLACE FUNCTION update_technical_indicators_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER technical_indicators_updated_at
  BEFORE UPDATE ON technical_indicators
  FOR EACH ROW
  EXECUTE FUNCTION update_technical_indicators_updated_at();

-- ============================================================
-- RBAC: Add view_technical_analysis permission
-- ============================================================

INSERT INTO permissions (name, description, resource, action) VALUES
  ('view_technical_analysis', 'View technical analysis charts and indicators', 'technical_analysis', 'read')
ON CONFLICT (name) DO NOTHING;

-- Assign to user role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'user' AND p.name = 'view_technical_analysis'
ON CONFLICT DO NOTHING;

-- Assign to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.name = 'view_technical_analysis'
ON CONFLICT DO NOTHING;

-- ============================================================
-- Enable Realtime for technical_indicators
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE technical_indicators;

-- ============================================================
-- Cron Schedules for Price Data & Indicator Computation
-- ============================================================

-- Fetch price data twice daily (before bias generation)
SELECT cron.schedule(
  'fetch-price-data-morning',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/fetch-price-data',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'fetch-price-data-evening',
  '0 19 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/fetch-price-data',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Compute indicators 30 min after price data fetch
SELECT cron.schedule(
  'compute-indicators-morning',
  '30 7 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/compute-indicators',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'compute-indicators-evening',
  '30 19 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/compute-indicators',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Clean up old candles (keep 1 year of data)
SELECT cron.schedule(
  'cleanup-old-candles',
  '0 5 * * 0',
  $$
  DELETE FROM price_candles
  WHERE open_time < NOW() - INTERVAL '365 days';
  $$
);
