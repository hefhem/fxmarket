-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE economic_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_trade_bias ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper function: check if user is admin
-- ============================================================

CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = $1 AND r.name = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Profiles
-- ============================================================

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (is_admin(auth.uid()));

-- ============================================================
-- Roles & Permissions (read-only for users, full for admins)
-- ============================================================

CREATE POLICY "Anyone authenticated can view roles"
  ON roles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Anyone authenticated can view permissions"
  ON permissions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Anyone authenticated can view role_permissions"
  ON role_permissions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can view own roles"
  ON user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage user_roles"
  ON user_roles FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage roles"
  ON roles FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage permissions"
  ON permissions FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage role_permissions"
  ON role_permissions FOR ALL
  USING (is_admin(auth.uid()));

-- ============================================================
-- Currency Pairs (public read)
-- ============================================================

CREATE POLICY "Anyone authenticated can view currency pairs"
  ON currency_pairs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage currency pairs"
  ON currency_pairs FOR ALL
  USING (is_admin(auth.uid()));

-- ============================================================
-- Economic Events (public read)
-- ============================================================

CREATE POLICY "Anyone authenticated can view events"
  ON economic_events FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage events"
  ON economic_events FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- Event Analyses (public read)
-- ============================================================

CREATE POLICY "Anyone authenticated can view analyses"
  ON event_analyses FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage analyses"
  ON event_analyses FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- Daily Trade Bias (public read)
-- ============================================================

CREATE POLICY "Anyone authenticated can view bias"
  ON daily_trade_bias FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage bias"
  ON daily_trade_bias FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- Watchlists (user-owned)
-- ============================================================

CREATE POLICY "Users can view own watchlists"
  ON watchlists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own watchlists"
  ON watchlists FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- Alerts (user-owned)
-- ============================================================

CREATE POLICY "Users can view own alerts"
  ON alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own alerts"
  ON alerts FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- Notifications (user-owned)
-- ============================================================

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- System Logs (admin only)
-- ============================================================

CREATE POLICY "Admins can view system logs"
  ON system_logs FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Service role can manage system logs"
  ON system_logs FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- Enable Realtime for key tables
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE daily_trade_bias;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE economic_events;
