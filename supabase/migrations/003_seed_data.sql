-- ============================================================
-- Seed Data
-- ============================================================

-- Roles
INSERT INTO roles (name, description) VALUES
  ('admin', 'Full system access - manage users, roles, and system settings'),
  ('user', 'Standard user access - view data, manage watchlists and alerts');

-- Permissions
INSERT INTO permissions (name, description, resource, action) VALUES
  ('view_dashboard', 'View the main dashboard', 'dashboard', 'read'),
  ('view_events', 'View economic events', 'events', 'read'),
  ('view_analyses', 'View AI event analyses', 'analyses', 'read'),
  ('view_bias', 'View daily trade bias', 'bias', 'read'),
  ('manage_watchlist', 'Create/delete watchlist items', 'watchlist', 'write'),
  ('manage_alerts', 'Create/update/delete alerts', 'alerts', 'write'),
  ('view_notifications', 'View notifications', 'notifications', 'read'),
  ('manage_profile', 'Update own profile', 'profile', 'write'),
  ('admin_users', 'Manage users and roles', 'admin', 'write'),
  ('admin_system', 'View system logs and status', 'admin', 'read'),
  ('admin_data', 'Manage currency pairs and trigger data fetches', 'admin', 'write');

-- Role-Permission assignments
-- User role gets standard permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'user' AND p.name IN (
  'view_dashboard', 'view_events', 'view_analyses', 'view_bias',
  'manage_watchlist', 'manage_alerts', 'view_notifications', 'manage_profile'
);

-- Admin role gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin';

-- G7 Currency Pairs
INSERT INTO currency_pairs (base_currency, quote_currency, symbol, display_name) VALUES
  ('EUR', 'USD', 'EUR/USD', 'Euro / US Dollar'),
  ('GBP', 'USD', 'GBP/USD', 'British Pound / US Dollar'),
  ('USD', 'JPY', 'USD/JPY', 'US Dollar / Japanese Yen'),
  ('USD', 'CHF', 'USD/CHF', 'US Dollar / Swiss Franc'),
  ('AUD', 'USD', 'AUD/USD', 'Australian Dollar / US Dollar'),
  ('USD', 'CAD', 'USD/CAD', 'US Dollar / Canadian Dollar'),
  ('NZD', 'USD', 'NZD/USD', 'New Zealand Dollar / US Dollar');
