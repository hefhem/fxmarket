-- ============================================================
-- FX Market Analyzer - Initial Schema
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ============================================================
-- RBAC Tables
-- ============================================================

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  resource VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

-- ============================================================
-- User Profiles
-- ============================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  avatar_url TEXT,
  timezone VARCHAR(50) DEFAULT 'UTC',
  default_pairs TEXT[] DEFAULT ARRAY['EUR/USD', 'GBP/USD', 'USD/JPY'],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Profile insert failed: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT NEW.id, id FROM public.roles WHERE name = 'user';
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Role insert failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Currency Pairs
-- ============================================================

CREATE TABLE currency_pairs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  base_currency VARCHAR(3) NOT NULL,
  quote_currency VARCHAR(3) NOT NULL,
  symbol VARCHAR(7) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Economic Events
-- ============================================================

CREATE TABLE economic_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source VARCHAR(20) NOT NULL CHECK (source IN ('finnhub', 'jblanked', 'rss')),
  event_name TEXT NOT NULL,
  country VARCHAR(50),
  currency VARCHAR(3) NOT NULL,
  impact VARCHAR(10) NOT NULL CHECK (impact IN ('low', 'medium', 'high')),
  event_datetime TIMESTAMPTZ NOT NULL,
  actual VARCHAR(50),
  forecast VARCHAR(50),
  previous VARCHAR(50),
  source_event_id VARCHAR(255),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source, source_event_id)
);

CREATE INDEX idx_events_datetime ON economic_events(event_datetime DESC);
CREATE INDEX idx_events_currency ON economic_events(currency);
CREATE INDEX idx_events_impact ON economic_events(impact);
CREATE INDEX idx_events_source ON economic_events(source);

-- ============================================================
-- Event Analyses (AI)
-- ============================================================

CREATE TABLE event_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES economic_events(id) ON DELETE CASCADE,
  sentiment VARCHAR(10) NOT NULL CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  affected_pairs TEXT[] NOT NULL DEFAULT '{}',
  reasoning TEXT NOT NULL,
  model_used VARCHAR(50) DEFAULT 'claude-haiku-4-5',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id)
);

CREATE INDEX idx_analyses_event ON event_analyses(event_id);
CREATE INDEX idx_analyses_sentiment ON event_analyses(sentiment);

-- ============================================================
-- Daily Trade Bias
-- ============================================================

CREATE TABLE daily_trade_bias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pair_id UUID REFERENCES currency_pairs(id) ON DELETE CASCADE,
  analysis_date DATE NOT NULL,
  bias_score DECIMAL(4,3) NOT NULL CHECK (bias_score >= -1 AND bias_score <= 1),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('bullish', 'bearish', 'neutral')),
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  contributing_events UUID[] DEFAULT '{}',
  ai_reasoning TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pair_id, analysis_date)
);

CREATE INDEX idx_bias_date ON daily_trade_bias(analysis_date DESC);
CREATE INDEX idx_bias_pair ON daily_trade_bias(pair_id);

-- ============================================================
-- Watchlists
-- ============================================================

CREATE TABLE watchlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  pair_id UUID REFERENCES currency_pairs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, pair_id)
);

-- ============================================================
-- Alerts & Notifications
-- ============================================================

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  pair_id UUID REFERENCES currency_pairs(id) ON DELETE SET NULL,
  alert_type VARCHAR(30) NOT NULL CHECK (alert_type IN ('bias_change', 'high_impact_event', 'confidence_threshold')),
  conditions JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- ============================================================
-- System Logs (for admin monitoring)
-- ============================================================

CREATE TABLE system_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level VARCHAR(10) NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  source VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_logs_level ON system_logs(level, created_at DESC);

-- ============================================================
-- Updated_at trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON economic_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bias_updated_at BEFORE UPDATE ON daily_trade_bias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
